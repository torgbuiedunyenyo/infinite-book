#!/usr/bin/env npx ts-node
/**
 * Pre-Generation Script
 * 
 * Generates pages for the core story and side stories in proper sequence,
 * respecting all narrative context requirements (book arcs, chunk summaries, etc.)
 * 
 * Usage:
 *   npx ts-node src/scripts/pregenerate.ts
 *   npx ts-node src/scripts/pregenerate.ts --core-only
 *   npx ts-node src/scripts/pregenerate.ts --sides-only
 *   npx ts-node src/scripts/pregenerate.ts --dry-run
 */

import 'dotenv/config';
import { Pool } from 'pg';

// Configuration
const CORE_SEED = "The Shape of Time";
const CORE_TARGET_PAGE = 50;
const SIDE_STORY_TARGET_PAGE = 6;
const SIDE_STORY_COUNT = 10;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

// ==================== DATABASE QUERIES ====================

interface PageRow {
  seed: string;
  page_number: number;
  references: { text: string; seed: string }[];
}

async function getHighestPage(seed: string): Promise<number> {
  const result = await pool.query(
    `SELECT MAX(page_number) as highest FROM pages WHERE seed = $1`,
    [seed]
  );
  return result.rows[0]?.highest || 0;
}

async function getPageReferences(seed: string, pageNumber: number): Promise<{ text: string; seed: string }[]> {
  const result = await pool.query(
    `SELECT "references" FROM pages WHERE seed = $1 AND page_number = $2`,
    [seed, pageNumber]
  );
  return result.rows[0]?.references || [];
}

async function getAllReferencesFromBook(seed: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT DISTINCT jsonb_array_elements("references")->>'seed' as ref_seed 
     FROM pages 
     WHERE seed = $1 
     ORDER BY ref_seed`,
    [seed]
  );
  return result.rows.map(r => r.ref_seed).filter(Boolean);
}

async function getBookStats(): Promise<{ seed: string; pageCount: number }[]> {
  const result = await pool.query(
    `SELECT seed, COUNT(*) as page_count 
     FROM pages 
     GROUP BY seed 
     ORDER BY seed`
  );
  return result.rows.map(r => ({ seed: r.seed, pageCount: parseInt(r.page_count, 10) }));
}

// ==================== API CALLS ====================

// Timeout for fetch requests (LLM generation can take 2+ minutes)
const FETCH_TIMEOUT_MS = 180000; // 3 minutes

async function generatePage(
  seed: string, 
  pageNumber: number, 
  referrerSeed?: string, 
  referrerPage?: number,
  retryCount: number = 0
): Promise<{ success: boolean; isNewDiscovery: boolean; error?: string }> {
  let url = `${API_BASE_URL}/api/page?seed=${encodeURIComponent(seed)}&page=${pageNumber}`;
  
  // Include referrer context for page 1 of non-canonical seeds
  if (referrerSeed && referrerPage && pageNumber === 1) {
    url += `&referrerSeed=${encodeURIComponent(referrerSeed)}&referrerPage=${referrerPage}`;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, isNewDiscovery: false, error: `HTTP ${response.status}: ${errorBody.slice(0, 200)}` };
    }
    
    const data = await response.json() as { isNewDiscovery: boolean };
    return { success: true, isNewDiscovery: data.isNewDiscovery };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Retry on timeout or network errors (up to 2 retries)
    if (retryCount < 2 && (errorMsg.includes('abort') || errorMsg.includes('ECONNREFUSED'))) {
      console.log(`    Retrying (attempt ${retryCount + 2}/3)...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return generatePage(seed, pageNumber, referrerSeed, referrerPage, retryCount + 1);
    }
    
    return { 
      success: false, 
      isNewDiscovery: false, 
      error: errorMsg
    };
  }
}

// ==================== GENERATION LOGIC ====================

interface GenerationProgress {
  seed: string;
  currentPage: number;
  targetPage: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
}

async function generateBookToPage(
  seed: string,
  targetPage: number,
  referrerSeed?: string,
  referrerPage?: number,
  onProgress?: (progress: GenerationProgress) => void
): Promise<GenerationProgress> {
  const highestPage = await getHighestPage(seed);
  
  const progress: GenerationProgress = {
    seed,
    currentPage: highestPage,
    targetPage,
    status: 'in_progress',
  };
  
  if (highestPage >= targetPage) {
    progress.status = 'completed';
    onProgress?.(progress);
    return progress;
  }
  
  // Generate pages sequentially
  for (let page = highestPage + 1; page <= targetPage; page++) {
    progress.currentPage = page;
    onProgress?.(progress);
    
    // For page 1 of side stories, include referrer context
    const useReferrer = page === 1 && referrerSeed && referrerPage;
    
    const result = await generatePage(
      seed, 
      page, 
      useReferrer ? referrerSeed : undefined, 
      useReferrer ? referrerPage : undefined
    );
    
    if (!result.success) {
      progress.status = 'failed';
      progress.error = result.error;
      onProgress?.(progress);
      return progress;
    }
    
    // Small delay between pages to let background tasks complete
    // (fact extraction, arc generation, chunk summaries)
    if (page % 5 === 0) {
      // Extra delay at chunk boundaries (pages 5, 10, 15, etc.)
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  progress.currentPage = targetPage;
  progress.status = 'completed';
  onProgress?.(progress);
  return progress;
}

// ==================== CLI ====================

interface CLIArgs {
  coreOnly: boolean;
  sidesOnly: boolean;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(): CLIArgs {
  const args: CLIArgs = {
    coreOnly: false,
    sidesOnly: false,
    dryRun: false,
    help: false,
  };
  
  const argv = process.argv.slice(2);
  
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') args.help = true;
    if (arg === '--core-only') args.coreOnly = true;
    if (arg === '--sides-only') args.sidesOnly = true;
    if (arg === '--dry-run') args.dryRun = true;
  }
  
  return args;
}

function printHelp(): void {
  console.log(`
Pre-Generation Script - Generate pages for core story and side stories

USAGE:
  npx ts-node src/scripts/pregenerate.ts [OPTIONS]

OPTIONS:
  -h, --help       Show this help message
  --core-only      Only generate core story pages
  --sides-only     Only generate side story pages
  --dry-run        Show what would be generated without making API calls

CONFIGURATION:
  Core seed: "${CORE_SEED}"
  Core target: page ${CORE_TARGET_PAGE}
  Side stories: first ${SIDE_STORY_COUNT} referenced books
  Side story target: page ${SIDE_STORY_TARGET_PAGE} each
  API base URL: ${API_BASE_URL}
`);
}

// ==================== MAIN ====================

async function main(): Promise<void> {
  const args = parseArgs();
  
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  
  console.log('=====================================');
  console.log('  PRE-GENERATION SCRIPT');
  console.log('=====================================\n');
  
  const startTime = Date.now();
  
  // Get current state
  console.log('Checking current state...\n');
  const stats = await getBookStats();
  
  const coreStats = stats.find(s => s.seed === CORE_SEED);
  const coreCurrentPage = coreStats?.pageCount || 0;
  
  console.log(`Core story "${CORE_SEED}":`);
  console.log(`  Current: page ${coreCurrentPage}`);
  console.log(`  Target: page ${CORE_TARGET_PAGE}`);
  console.log(`  Pages to generate: ${Math.max(0, CORE_TARGET_PAGE - coreCurrentPage)}\n`);
  
  // Find side stories (references from core story)
  const allReferences = await getAllReferencesFromBook(CORE_SEED);
  const sideStories = allReferences.slice(0, SIDE_STORY_COUNT);
  
  console.log(`Side stories (first ${SIDE_STORY_COUNT} references from core):`);
  for (const ref of sideStories) {
    const refStats = stats.find(s => s.seed === ref);
    const currentPage = refStats?.pageCount || 0;
    const toGenerate = Math.max(0, SIDE_STORY_TARGET_PAGE - currentPage);
    console.log(`  "${ref}": page ${currentPage} → ${SIDE_STORY_TARGET_PAGE} (${toGenerate} to generate)`);
  }
  console.log('');
  
  if (args.dryRun) {
    console.log('DRY RUN - No pages will be generated.\n');
    await pool.end();
    return;
  }
  
  // Helper for progress logging
  const logProgress = (p: GenerationProgress) => {
    const statusEmoji = p.status === 'completed' ? '✓' : p.status === 'failed' ? '✗' : '⋯';
    const pageStr = `${p.currentPage}/${p.targetPage}`;
    console.log(`  ${statusEmoji} "${p.seed}" page ${pageStr}${p.error ? ` - ${p.error}` : ''}`);
  };
  
  let pagesGenerated = 0;
  let errors = 0;
  
  // Generate core story
  if (!args.sidesOnly) {
    console.log('=====================================');
    console.log('  GENERATING CORE STORY');
    console.log('=====================================\n');
    
    const coreResult = await generateBookToPage(
      CORE_SEED,
      CORE_TARGET_PAGE,
      undefined,
      undefined,
      logProgress
    );
    
    if (coreResult.status === 'completed') {
      pagesGenerated += CORE_TARGET_PAGE - coreCurrentPage;
    } else {
      errors++;
      console.log(`\n  CORE STORY FAILED at page ${coreResult.currentPage}: ${coreResult.error}\n`);
    }
    
    console.log('');
  }
  
  // Generate side stories
  if (!args.coreOnly && sideStories.length > 0) {
    console.log('=====================================');
    console.log('  GENERATING SIDE STORIES');
    console.log('=====================================\n');
    
    // Find a referrer page for each side story
    // We need to find which page of the core story references this side story
    for (const sideStory of sideStories) {
      console.log(`\nStarting "${sideStory}"...`);
      
      // Find which page of the core story first references this side story
      let referrerPage = 1;
      for (let p = 1; p <= coreCurrentPage; p++) {
        const refs = await getPageReferences(CORE_SEED, p);
        if (refs.some(r => r.seed === sideStory)) {
          referrerPage = p;
          break;
        }
      }
      
      const sideStats = stats.find(s => s.seed === sideStory);
      const sideCurrentPage = sideStats?.pageCount || 0;
      
      const sideResult = await generateBookToPage(
        sideStory,
        SIDE_STORY_TARGET_PAGE,
        CORE_SEED,
        referrerPage,
        logProgress
      );
      
      if (sideResult.status === 'completed') {
        pagesGenerated += Math.max(0, SIDE_STORY_TARGET_PAGE - sideCurrentPage);
      } else {
        errors++;
        console.log(`  FAILED at page ${sideResult.currentPage}: ${sideResult.error}`);
      }
    }
    
    console.log('');
  }
  
  // Summary
  const totalTime = (Date.now() - startTime) / 1000;
  
  console.log('=====================================');
  console.log('  PRE-GENERATION COMPLETE');
  console.log('=====================================');
  console.log(`  Pages generated: ~${pagesGenerated}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total time: ${totalTime.toFixed(1)}s`);
  console.log('=====================================\n');
  
  await pool.end();
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

