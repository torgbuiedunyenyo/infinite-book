#!/usr/bin/env npx ts-node
/**
 * Generate Inset Narratives Script
 * 
 * Generates the first N inset narratives (side stories) referenced from
 * "The Shape of Time", each to a target page count.
 * 
 * Generates them sequentially - complete one book before starting the next.
 * 
 * Usage:
 *   npx ts-node src/scripts/generateInsets.ts
 */

import 'dotenv/config';
import { Pool } from 'pg';

// Configuration
const CORE_SEED = "The Shape of Time";
const RAILWAY_BACKEND_URL = process.env.RAILWAY_URL || 'https://infinite-book-production-4bcf.up.railway.app';
const TARGET_INSET_COUNT = 20;  // First 20 inset narratives
const TARGET_PAGE_PER_INSET = 20;  // 20 pages each
const MAX_PAGE_RETRIES = 5;
const FETCH_TIMEOUT_MS = 300000; // 5 minutes

// Database connection for querying references
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

// ==================== DATABASE QUERIES ====================

interface ReferenceInfo {
  seed: string;
  firstPageAppearance: number;
}

async function getReferencesFromCoreStory(): Promise<ReferenceInfo[]> {
  // Get all unique references from "The Shape of Time" ordered by first appearance
  const result = await pool.query(`
    SELECT 
      ref_seed as seed,
      MIN(page_number) as first_page_appearance
    FROM (
      SELECT 
        page_number,
        jsonb_array_elements("references")->>'seed' as ref_seed 
      FROM pages 
      WHERE seed = $1
    ) refs
    WHERE ref_seed IS NOT NULL AND ref_seed != $1
    GROUP BY ref_seed
    ORDER BY first_page_appearance, ref_seed
  `, [CORE_SEED]);
  
  return result.rows.map(r => ({
    seed: r.seed,
    firstPageAppearance: parseInt(r.first_page_appearance, 10),
  }));
}

async function getHighestPage(seed: string): Promise<number> {
  const result = await pool.query(
    `SELECT MAX(page_number) as highest FROM pages WHERE seed = $1`,
    [seed]
  );
  return result.rows[0]?.highest || 0;
}

async function getReferrerPage(seed: string): Promise<number> {
  // Find which page of the core story first references this inset
  const result = await pool.query(`
    SELECT MIN(page_number) as first_page
    FROM (
      SELECT 
        page_number,
        jsonb_array_elements("references")->>'seed' as ref_seed 
      FROM pages 
      WHERE seed = $1
    ) refs
    WHERE ref_seed = $2
  `, [CORE_SEED, seed]);
  
  return result.rows[0]?.first_page || 1;
}

// ==================== API CALLS ====================

async function generatePage(
  seed: string,
  pageNumber: number,
  referrerSeed?: string,
  referrerPage?: number
): Promise<boolean> {
  let url = `${RAILWAY_BACKEND_URL}/api/page?seed=${encodeURIComponent(seed)}&page=${pageNumber}`;
  
  // Include referrer context for page 1 of insets
  if (referrerSeed && referrerPage && pageNumber === 1) {
    url += `&referrerSeed=${encodeURIComponent(referrerSeed)}&referrerPage=${referrerPage}`;
  }
  
  for (let attempt = 1; attempt <= MAX_PAGE_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return true;
      }
      
      const errorBody = await response.text();
      console.log(`    ⚠️  Attempt ${attempt}/${MAX_PAGE_RETRIES} failed: HTTP ${response.status}`);
      console.log(`       ${errorBody.slice(0, 150)}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`    ⚠️  Attempt ${attempt}/${MAX_PAGE_RETRIES} failed: ${msg}`);
    }
    
    if (attempt < MAX_PAGE_RETRIES) {
      console.log(`    Waiting 15s before retry...`);
      await sleep(15000);
    }
  }
  
  return false;
}

// ==================== UTILITIES ====================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// ==================== MAIN ====================

async function main(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  GENERATE INSET NARRATIVES                                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  console.log(`Backend URL: ${RAILWAY_BACKEND_URL}`);
  console.log(`Target: First ${TARGET_INSET_COUNT} insets, ${TARGET_PAGE_PER_INSET} pages each\n`);
  
  // Get all references from core story
  console.log('Fetching references from "The Shape of Time"...\n');
  const allReferences = await getReferencesFromCoreStory();
  
  if (allReferences.length === 0) {
    console.log('No references found in the core story.');
    await pool.end();
    return;
  }
  
  // Take first N
  const targetInsets = allReferences.slice(0, TARGET_INSET_COUNT);
  
  console.log(`Found ${allReferences.length} total inset narratives.`);
  console.log(`Will generate ${targetInsets.length} insets:\n`);
  
  for (let i = 0; i < targetInsets.length; i++) {
    const inset = targetInsets[i];
    const currentPages = await getHighestPage(inset.seed);
    console.log(`  ${i + 1}. "${inset.seed}" (first appears on p.${inset.firstPageAppearance}, current: ${currentPages} pages)`);
  }
  
  console.log('\n' + '═'.repeat(60) + '\n');
  
  const startTime = Date.now();
  let totalPagesGenerated = 0;
  let totalFailed = 0;
  
  // Generate each inset sequentially
  for (let i = 0; i < targetInsets.length; i++) {
    const inset = targetInsets[i];
    const insetNumber = i + 1;
    
    console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
    console.log(`║  INSET ${insetNumber}/${targetInsets.length}: "${inset.seed}"`);
    console.log(`╚═══════════════════════════════════════════════════════════╝\n`);
    
    // Get current state
    const currentPage = await getHighestPage(inset.seed);
    
    if (currentPage >= TARGET_PAGE_PER_INSET) {
      console.log(`  ✅ Already at ${currentPage} pages (target: ${TARGET_PAGE_PER_INSET}). Skipping.\n`);
      continue;
    }
    
    // Get referrer page for this inset
    const referrerPage = await getReferrerPage(inset.seed);
    
    console.log(`  Current pages: ${currentPage}`);
    console.log(`  Target: ${TARGET_PAGE_PER_INSET}`);
    console.log(`  Pages to generate: ${TARGET_PAGE_PER_INSET - currentPage}`);
    console.log(`  Referrer: "${CORE_SEED}" p.${referrerPage}\n`);
    
    const insetStartTime = Date.now();
    let insetPagesGenerated = 0;
    let insetFailed = 0;
    
    // Generate pages for this inset
    for (let page = currentPage + 1; page <= TARGET_PAGE_PER_INSET; page++) {
      console.log(`  📖 Generating page ${page}/${TARGET_PAGE_PER_INSET}...`);
      const pageStart = Date.now();
      
      // Use referrer context only for page 1
      const success = await generatePage(
        inset.seed,
        page,
        page === 1 ? CORE_SEED : undefined,
        page === 1 ? referrerPage : undefined
      );
      
      if (success) {
        const duration = Date.now() - pageStart;
        insetPagesGenerated++;
        totalPagesGenerated++;
        console.log(`     ✅ Page ${page} complete (${formatDuration(duration)})`);
      } else {
        insetFailed++;
        totalFailed++;
        console.log(`     ❌ Page ${page} FAILED`);
      }
      
      // Delay between pages - extra at chunk boundaries
      if (page % 5 === 0) {
        console.log(`     ⏳ Chunk boundary - waiting 10s for summaries...`);
        await sleep(10000);
      } else {
        await sleep(2000);
      }
    }
    
    const insetTime = Date.now() - insetStartTime;
    console.log(`\n  ═══ "${inset.seed}" complete ═══`);
    console.log(`  Pages generated: ${insetPagesGenerated}`);
    console.log(`  Failed: ${insetFailed}`);
    console.log(`  Time: ${formatDuration(insetTime)}`);
    
    // Progress report
    const elapsed = Date.now() - startTime;
    const avgTimePerInset = elapsed / (i + 1);
    const remainingInsets = targetInsets.length - (i + 1);
    const eta = avgTimePerInset * remainingInsets;
    
    console.log(`\n  ═══ Overall Progress ═══`);
    console.log(`  Insets completed: ${i + 1}/${targetInsets.length}`);
    console.log(`  Total pages generated: ${totalPagesGenerated}`);
    console.log(`  Elapsed: ${formatDuration(elapsed)}`);
    if (remainingInsets > 0) {
      console.log(`  ETA for remaining: ${formatDuration(eta)}`);
    }
  }
  
  // Final report
  const totalTime = Date.now() - startTime;
  
  console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  INSET GENERATION COMPLETE                                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\n  Insets processed: ${targetInsets.length}`);
  console.log(`  Total pages generated: ${totalPagesGenerated}`);
  console.log(`  Total failed: ${totalFailed}`);
  console.log(`  Total time: ${formatDuration(totalTime)}`);
  
  await pool.end();
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  pool.end();
  process.exit(1);
});

