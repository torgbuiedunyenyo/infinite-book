#!/usr/bin/env npx ts-node
/**
 * Generate 150 Pages Script - Local Backend with Railway DB
 * 
 * This script runs a local backend connected to the Railway database
 * and generates pages sequentially. Use this if you can't access the 
 * deployed Railway backend URL directly.
 * 
 * Usage:
 *   1. Copy .env-2 content to .env (or run with explicit config below)
 *   2. Start backend: cd backend && npm run dev
 *   3. In another terminal: npx ts-node src/scripts/generate150-local.ts
 * 
 * Or use the simpler approach - just run the existing pregenerate:
 *   cd backend && npm run dev  (with .env-2 config)
 *   cd backend && npx ts-node src/scripts/pregenerate.ts --core-only
 */

import 'dotenv/config';
import { Pool } from 'pg';

// Configuration
const CORE_SEED = "The Shape of Time";
const TARGET_PAGE = 150;
const API_BASE_URL = 'http://localhost:3000';
const MAX_PAGE_RETRIES = 5;
const FETCH_TIMEOUT_MS = 300000; // 5 minutes

// Database for status checks
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

// ==================== DATABASE CHECKS ====================

async function getHighestPage(): Promise<number> {
  const result = await pool.query(
    `SELECT MAX(page_number) as highest FROM pages WHERE seed = $1`,
    [CORE_SEED]
  );
  return result.rows[0]?.highest || 0;
}

async function getGenerationStats(): Promise<{
  pageCount: number;
  hasArc: boolean;
  chunkCount: number;
  runningSummaryPage: number | null;
}> {
  const [pageResult, arcResult, chunkResult, runningResult] = await Promise.all([
    pool.query(`SELECT COUNT(*) as count FROM pages WHERE seed = $1`, [CORE_SEED]),
    pool.query(`SELECT seed FROM book_arcs WHERE seed = $1`, [CORE_SEED]),
    pool.query(`SELECT COUNT(*) as count FROM chunk_summaries WHERE seed = $1`, [CORE_SEED]),
    pool.query(`SELECT last_updated_page FROM running_summaries WHERE seed = $1`, [CORE_SEED]),
  ]);
  
  return {
    pageCount: parseInt(pageResult.rows[0]?.count || '0', 10),
    hasArc: arcResult.rows.length > 0,
    chunkCount: parseInt(chunkResult.rows[0]?.count || '0', 10),
    runningSummaryPage: runningResult.rows[0]?.last_updated_page || null,
  };
}

// ==================== API CALLS ====================

async function generatePage(pageNumber: number): Promise<boolean> {
  const url = `${API_BASE_URL}/api/page?seed=${encodeURIComponent(CORE_SEED)}&page=${pageNumber}`;
  
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
      console.log(`       ${errorBody.slice(0, 100)}`);
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
  console.log('║  GENERATE 150 PAGES - Local Backend + Railway DB          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  // Check database connection
  console.log('Checking database connection...');
  try {
    const stats = await getGenerationStats();
    console.log(`  Database connected!`);
    console.log(`  Current pages: ${stats.pageCount}`);
    console.log(`  Book arc: ${stats.hasArc ? 'Yes' : 'No'}`);
    console.log(`  Chunk summaries: ${stats.chunkCount}`);
    console.log(`  Running summary page: ${stats.runningSummaryPage || 'None'}`);
  } catch (error) {
    console.error(`  ❌ Database connection failed: ${error}`);
    console.error('\nMake sure DATABASE_URL is set correctly.');
    console.error('For Railway, you may need to use the public postgres URL.');
    process.exit(1);
  }
  
  // Check API connection
  console.log('\nChecking API connection...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/stats`, { 
      signal: AbortSignal.timeout(5000) 
    });
    if (response.ok) {
      console.log('  API connected!');
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`  ❌ API connection failed: ${error}`);
    console.error('\nMake sure the backend is running:');
    console.error('  cd backend && npm run dev');
    process.exit(1);
  }
  
  const startPage = await getHighestPage();
  console.log(`\nStarting from page ${startPage + 1} → ${TARGET_PAGE}`);
  console.log(`Pages to generate: ${TARGET_PAGE - startPage}\n`);
  
  if (startPage >= TARGET_PAGE) {
    console.log(`\n✅ Target already reached!`);
    await pool.end();
    return;
  }
  
  const startTime = Date.now();
  let pagesGenerated = 0;
  let pagesFailed = 0;
  
  for (let page = startPage + 1; page <= TARGET_PAGE; page++) {
    // Progress report every 5 pages
    if ((page - startPage - 1) % 5 === 0 && page !== startPage + 1) {
      const elapsed = Date.now() - startTime;
      const avgTime = pagesGenerated > 0 ? elapsed / pagesGenerated : 0;
      const remaining = (TARGET_PAGE - page + 1) * avgTime;
      console.log(`\n--- Progress: ${page - 1}/${TARGET_PAGE} | Generated: ${pagesGenerated} | Avg: ${formatDuration(avgTime)} | ETA: ${formatDuration(remaining)} ---\n`);
    }
    
    console.log(`📖 Generating page ${page}/${TARGET_PAGE}...`);
    const pageStart = Date.now();
    
    const success = await generatePage(page);
    
    if (success) {
      const duration = Date.now() - pageStart;
      pagesGenerated++;
      console.log(`   ✅ Page ${page} complete (${formatDuration(duration)})`);
      
      // Show context stats periodically
      if (page % 10 === 0) {
        const stats = await getGenerationStats();
        console.log(`   📊 Stats: ${stats.pageCount} pages, ${stats.chunkCount} chunks, running@${stats.runningSummaryPage}`);
      }
    } else {
      pagesFailed++;
      console.log(`   ❌ Page ${page} FAILED`);
    }
    
    // Delay between pages - extra at chunk boundaries
    if (page % 5 === 0) {
      console.log(`   ⏳ Chunk boundary - waiting 10s for background tasks...`);
      await sleep(10000);
    } else {
      await sleep(2000);
    }
  }
  
  // Final report
  const totalTime = Date.now() - startTime;
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  GENERATION COMPLETE                                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`  Pages generated: ${pagesGenerated}`);
  console.log(`  Pages failed: ${pagesFailed}`);
  console.log(`  Total time: ${formatDuration(totalTime)}`);
  
  const finalStats = await getGenerationStats();
  console.log(`\n  Final stats:`);
  console.log(`    Total pages: ${finalStats.pageCount}`);
  console.log(`    Book arc: ${finalStats.hasArc ? 'Yes' : 'No'}`);
  console.log(`    Chunk summaries: ${finalStats.chunkCount}`);
  console.log(`    Running summary at: page ${finalStats.runningSummaryPage}`);
  
  await pool.end();
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  pool.end();
  process.exit(1);
});


