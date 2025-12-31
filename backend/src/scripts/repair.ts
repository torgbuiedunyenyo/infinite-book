/**
 * Repair script for The Infinite Book
 * 
 * Fixes integrity issues:
 * 1. Generates missing book_arcs for seeds that have pages but no arc
 * 2. Generates missing chunk_summaries for completed chunks
 * 3. Generates missing running_summaries
 * 
 * Run this BEFORE continuing pre-generation to ensure data integrity.
 */

import dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import { generateBookArc, generateChunkSummary, generateRunningSummary } from '../services/summaryService';
import { saveBookArc, saveChunkSummary, saveRunningSummary, getBookArc, getPagesRange } from '../services/database';
import { Page, BookArc } from '../types';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(message: string): void {
  console.log(`[${timestamp()}] ${message}`);
}

interface SeedInfo {
  seed: string;
  maxPage: number;
  hasBookArc: boolean;
  chunkSummaries: number[];
  hasRunningSummary: boolean;
}

async function getSeedInfo(seed: string): Promise<SeedInfo> {
  const maxPageResult = await pool.query(`
    SELECT MAX(page_number) as max_page FROM pages WHERE seed = $1
  `, [seed]);
  const maxPage = maxPageResult.rows[0]?.max_page || 0;
  
  const arcResult = await pool.query(`
    SELECT 1 FROM book_narrative_arcs WHERE seed = $1 LIMIT 1
  `, [seed]);
  const hasBookArc = arcResult.rows.length > 0;
  
  const chunksResult = await pool.query(`
    SELECT chunk_end FROM chunk_summaries WHERE seed = $1 ORDER BY chunk_end
  `, [seed]);
  const chunkSummaries = chunksResult.rows.map(r => r.chunk_end);
  
  const summaryResult = await pool.query(`
    SELECT 1 FROM running_summaries WHERE seed = $1 LIMIT 1
  `, [seed]);
  const hasRunningSummary = summaryResult.rows.length > 0;
  
  return { seed, maxPage, hasBookArc, chunkSummaries, hasRunningSummary };
}

async function getPage1Content(seed: string): Promise<string | null> {
  const result = await pool.query(`
    SELECT content FROM pages WHERE seed = $1 AND page_number = 1
  `, [seed]);
  return result.rows[0]?.content || null;
}

async function repairMissingBookArc(seed: string): Promise<boolean> {
  log(`  Generating book arc for "${seed}"...`);
  
  const page1Content = await getPage1Content(seed);
  if (!page1Content) {
    log(`  ✗ No page 1 content found for "${seed}"`);
    return false;
  }
  
  const arc = await generateBookArc(seed, page1Content);
  if (!arc) {
    log(`  ✗ Failed to generate book arc for "${seed}"`);
    return false;
  }
  
  await saveBookArc(arc);
  log(`  ✓ Book arc generated and saved for "${seed}" (mode: ${arc.narrativeMode})`);
  return true;
}

async function repairMissingChunks(seed: string, existingChunks: number[], maxPage: number): Promise<number> {
  const expectedChunks: number[] = [];
  for (let chunkEnd = 5; chunkEnd <= maxPage; chunkEnd += 5) {
    expectedChunks.push(chunkEnd);
  }
  
  const missingChunks = expectedChunks.filter(c => !existingChunks.includes(c));
  if (missingChunks.length === 0) return 0;
  
  log(`  Missing chunks for "${seed}": ${missingChunks.join(', ')}`);
  
  const bookArc = await getBookArc(seed);
  if (!bookArc) {
    log(`  ✗ Cannot generate chunks without book arc`);
    return 0;
  }
  
  let repaired = 0;
  for (const chunkEnd of missingChunks.sort((a, b) => a - b)) {
    const chunkStart = chunkEnd - 4;
    log(`  Generating chunk ${chunkStart}-${chunkEnd}...`);
    
    const pages = await getPagesRange(seed, chunkStart, chunkEnd);
    if (pages.length === 0) {
      log(`  ✗ No pages found for chunk ${chunkStart}-${chunkEnd}`);
      continue;
    }
    
    const chunk = await generateChunkSummary(seed, chunkStart, chunkEnd, pages, bookArc);
    if (chunk) {
      await saveChunkSummary(chunk);
      log(`  ✓ Chunk ${chunkStart}-${chunkEnd} generated`);
      repaired++;
    } else {
      log(`  ✗ Failed to generate chunk ${chunkStart}-${chunkEnd}`);
    }
  }
  
  return repaired;
}

async function repairMissingSummary(seed: string, maxPage: number): Promise<boolean> {
  if (maxPage < 5) return true;  // Not needed yet
  
  const bookArc = await getBookArc(seed);
  if (!bookArc) {
    log(`  ✗ Cannot generate running summary without book arc`);
    return false;
  }
  
  // Get the most recent chunk summary
  const chunksResult = await pool.query(`
    SELECT chunk_end, summary FROM chunk_summaries 
    WHERE seed = $1 
    ORDER BY chunk_end DESC 
    LIMIT 1
  `, [seed]);
  
  if (chunksResult.rows.length === 0) {
    log(`  ✗ Cannot generate running summary without chunk summaries`);
    return false;
  }
  
  const latestChunk = chunksResult.rows[0];
  
  log(`  Generating running summary for "${seed}" (after page ${latestChunk.chunk_end})...`);
  
  const summary = await generateRunningSummary(
    seed,
    latestChunk.chunk_end,
    bookArc,
    null,  // No previous momentum
    latestChunk.summary
  );
  
  if (summary) {
    await saveRunningSummary(summary);
    log(`  ✓ Running summary generated for "${seed}"`);
    return true;
  }
  
  log(`  ✗ Failed to generate running summary for "${seed}"`);
  return false;
}

async function main(): Promise<void> {
  log('╔════════════════════════════════════════════════════════════╗');
  log('║        THE INFINITE BOOK - REPAIR SCRIPT                  ║');
  log('╚════════════════════════════════════════════════════════════╝\n');
  
  // Get all seeds
  const seedsResult = await pool.query(`
    SELECT DISTINCT seed FROM pages ORDER BY seed
  `);
  const seeds = seedsResult.rows.map(r => r.seed);
  
  log(`Found ${seeds.length} seeds to check\n`);
  
  let arcsRepaired = 0;
  let chunksRepaired = 0;
  let summariesRepaired = 0;
  
  for (const seed of seeds) {
    const info = await getSeedInfo(seed);
    
    log(`\nChecking "${seed}" (pages 1-${info.maxPage})...`);
    
    // Repair missing book arc
    if (info.maxPage >= 1 && !info.hasBookArc) {
      const success = await repairMissingBookArc(seed);
      if (success) arcsRepaired++;
    } else if (info.hasBookArc) {
      log(`  ✓ Book arc exists`);
    }
    
    // Repair missing chunk summaries
    if (info.maxPage >= 5) {
      const repaired = await repairMissingChunks(seed, info.chunkSummaries, info.maxPage);
      chunksRepaired += repaired;
      if (repaired === 0 && info.chunkSummaries.length > 0) {
        log(`  ✓ All chunk summaries exist: [${info.chunkSummaries.join(', ')}]`);
      }
    }
    
    // Repair missing running summary
    if (info.maxPage >= 5 && !info.hasRunningSummary) {
      const success = await repairMissingSummary(seed, info.maxPage);
      if (success) summariesRepaired++;
    } else if (info.hasRunningSummary) {
      log(`  ✓ Running summary exists`);
    }
  }
  
  log('\n');
  log('═'.repeat(60));
  log('REPAIR COMPLETE');
  log('═'.repeat(60));
  log(`Book arcs repaired: ${arcsRepaired}`);
  log(`Chunk summaries repaired: ${chunksRepaired}`);
  log(`Running summaries repaired: ${summariesRepaired}`);
  
  await pool.end();
  process.exit(0);
}

main().catch((error) => {
  log(`FATAL ERROR: ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  pool.end();
  process.exit(1);
});

