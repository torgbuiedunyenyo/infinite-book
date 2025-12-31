/**
 * Validation script for The Infinite Book
 * 
 * Checks all generated pages for data integrity:
 * - Pages 2+ should have a book_arc
 * - Pages 5, 10, 15... should have chunk_summaries
 * - Pages 6+ should have running_summaries
 * 
 * Identifies seeds that need to be regenerated from scratch or a checkpoint.
 */

import dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface SeedStatus {
  seed: string;
  maxPage: number;
  hasBookArc: boolean;
  chunkSummaries: number[];  // chunk_end values that exist
  expectedChunks: number[];  // chunk_end values that should exist
  hasRunningSummary: boolean;
  lastMomentumPage: number | null;
  issues: string[];
  validUpToPage: number;  // Highest page that's properly contextualized
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(message: string): void {
  console.log(`[${timestamp()}] ${message}`);
}

async function getAllSeeds(): Promise<string[]> {
  const result = await pool.query(`
    SELECT DISTINCT seed FROM pages ORDER BY seed
  `);
  return result.rows.map(r => r.seed);
}

async function getMaxPageForSeed(seed: string): Promise<number> {
  const result = await pool.query(`
    SELECT MAX(page_number) as max_page FROM pages WHERE seed = $1
  `, [seed]);
  return result.rows[0]?.max_page || 0;
}

async function hasBookArc(seed: string): Promise<boolean> {
  const result = await pool.query(`
    SELECT 1 FROM book_narrative_arcs WHERE seed = $1 LIMIT 1
  `, [seed]);
  return result.rows.length > 0;
}

async function getChunkSummaries(seed: string): Promise<number[]> {
  const result = await pool.query(`
    SELECT chunk_end FROM chunk_summaries WHERE seed = $1 ORDER BY chunk_end
  `, [seed]);
  return result.rows.map(r => r.chunk_end);
}

async function getRunningSummary(seed: string): Promise<{ exists: boolean; lastUpdatedPage: number | null }> {
  const result = await pool.query(`
    SELECT last_updated_page FROM running_summaries WHERE seed = $1 LIMIT 1
  `, [seed]);
  if (result.rows.length === 0) {
    return { exists: false, lastUpdatedPage: null };
  }
  return { exists: true, lastUpdatedPage: result.rows[0].last_updated_page };
}

function getExpectedChunks(maxPage: number): number[] {
  const chunks: number[] = [];
  for (let chunkEnd = 5; chunkEnd <= maxPage; chunkEnd += 5) {
    chunks.push(chunkEnd);
  }
  return chunks;
}

async function validateSeed(seed: string): Promise<SeedStatus> {
  const maxPage = await getMaxPageForSeed(seed);
  const bookArcExists = await hasBookArc(seed);
  const chunks = await getChunkSummaries(seed);
  const expectedChunks = getExpectedChunks(maxPage);
  const runningSummary = await getRunningSummary(seed);
  
  const issues: string[] = [];
  let validUpToPage = maxPage;  // Assume valid until we find issues
  
  // Check book arc (required for pages 2+)
  if (maxPage >= 2 && !bookArcExists) {
    issues.push(`Missing book_arc (required for pages 2+)`);
    validUpToPage = 1;  // Only page 1 is valid without book_arc
  }
  
  // Check chunk summaries (required for pages 6+)
  if (maxPage >= 5) {
    const missingChunks = expectedChunks.filter(c => !chunks.includes(c));
    if (missingChunks.length > 0) {
      issues.push(`Missing chunk summaries: ${missingChunks.join(', ')}`);
      
      // Find the first missing chunk and set validUpToPage accordingly
      const firstMissing = Math.min(...missingChunks);
      // If chunk 1-5 is missing, pages 6+ are invalid
      // Valid pages are up to the end of the last complete chunk
      const lastCompleteChunk = chunks.filter(c => c < firstMissing).sort((a, b) => b - a)[0];
      if (lastCompleteChunk) {
        validUpToPage = Math.min(validUpToPage, lastCompleteChunk);
      } else if (firstMissing === 5) {
        // No chunk summaries at all, but we need arc check first
        validUpToPage = Math.min(validUpToPage, 5);  // Pages 1-5 might be ok
      }
    }
  }
  
  // Check running summary (required for pages 6+)
  if (maxPage >= 6 && !runningSummary.exists) {
    issues.push(`Missing running_summary (required for pages 6+)`);
    // This is less critical - pages can still be generated with chunk summaries
  }
  
  // If no book arc, everything after page 1 is suspect
  if (!bookArcExists && maxPage >= 2) {
    validUpToPage = 1;
  }
  
  return {
    seed,
    maxPage,
    hasBookArc: bookArcExists,
    chunkSummaries: chunks,
    expectedChunks,
    hasRunningSummary: runningSummary.exists,
    lastMomentumPage: runningSummary.lastUpdatedPage,
    issues,
    validUpToPage,
  };
}

async function main(): Promise<void> {
  log('╔════════════════════════════════════════════════════════════╗');
  log('║        THE INFINITE BOOK - VALIDATION SCRIPT              ║');
  log('╚════════════════════════════════════════════════════════════╝\n');
  
  const seeds = await getAllSeeds();
  log(`Found ${seeds.length} seeds with pages\n`);
  
  const statuses: SeedStatus[] = [];
  const problemSeeds: SeedStatus[] = [];
  
  for (const seed of seeds) {
    const status = await validateSeed(seed);
    statuses.push(status);
    
    if (status.issues.length > 0) {
      problemSeeds.push(status);
    }
  }
  
  // Report on all seeds
  log('═'.repeat(70));
  log('ALL SEEDS STATUS:');
  log('═'.repeat(70));
  
  for (const status of statuses) {
    const icon = status.issues.length === 0 ? '✓' : '✗';
    const arcIcon = status.hasBookArc ? '✓' : '✗';
    const summaryIcon = status.hasRunningSummary ? '✓' : '✗';
    const chunksStr = status.chunkSummaries.length > 0 
      ? `[${status.chunkSummaries.join(',')}]` 
      : '[]';
    
    log(`${icon} "${status.seed}"`);
    log(`    Pages: 1-${status.maxPage} | Arc: ${arcIcon} | Summary: ${summaryIcon} | Chunks: ${chunksStr}`);
    if (status.issues.length > 0) {
      log(`    Valid up to page: ${status.validUpToPage}`);
      for (const issue of status.issues) {
        log(`    ⚠ ${issue}`);
      }
    }
  }
  
  // Summary of problems
  if (problemSeeds.length > 0) {
    log('\n');
    log('═'.repeat(70));
    log('SEEDS REQUIRING ATTENTION:');
    log('═'.repeat(70));
    
    for (const status of problemSeeds) {
      log(`\n"${status.seed}":`);
      log(`  Current state: pages 1-${status.maxPage}`);
      log(`  Valid up to: page ${status.validUpToPage}`);
      log(`  Issues:`);
      for (const issue of status.issues) {
        log(`    - ${issue}`);
      }
      
      if (status.validUpToPage < status.maxPage) {
        log(`  Action needed: Delete pages ${status.validUpToPage + 1}-${status.maxPage} and regenerate`);
      }
    }
    
    // Generate SQL to fix issues
    log('\n');
    log('═'.repeat(70));
    log('SQL TO DELETE INVALID PAGES:');
    log('═'.repeat(70));
    
    for (const status of problemSeeds) {
      if (status.validUpToPage < status.maxPage) {
        log(`\n-- "${status.seed}": Delete pages ${status.validUpToPage + 1}-${status.maxPage}`);
        log(`DELETE FROM pages WHERE seed = '${status.seed.replace(/'/g, "''")}' AND page_number > ${status.validUpToPage};`);
        
        // Also delete associated summaries if we're going back before page 5
        if (status.validUpToPage < 5) {
          log(`DELETE FROM chunk_summaries WHERE seed = '${status.seed.replace(/'/g, "''")}';`);
          log(`DELETE FROM running_summaries WHERE seed = '${status.seed.replace(/'/g, "''")}';`);
        }
        
        // Delete book arc if we're going back to page 1 only
        if (status.validUpToPage <= 1) {
          log(`DELETE FROM book_narrative_arcs WHERE seed = '${status.seed.replace(/'/g, "''")}';`);
        }
      }
    }
  } else {
    log('\n✓ All seeds are valid!');
  }
  
  // Stats
  log('\n');
  log('═'.repeat(70));
  log('SUMMARY:');
  log('═'.repeat(70));
  log(`Total seeds: ${seeds.length}`);
  log(`Valid seeds: ${seeds.length - problemSeeds.length}`);
  log(`Problem seeds: ${problemSeeds.length}`);
  
  const totalPages = statuses.reduce((sum, s) => sum + s.maxPage, 0);
  const validPages = statuses.reduce((sum, s) => sum + s.validUpToPage, 0);
  log(`Total pages: ${totalPages}`);
  log(`Valid pages: ${validPages}`);
  if (totalPages > validPages) {
    log(`Pages to regenerate: ${totalPages - validPages}`);
  }
  
  await pool.end();
  process.exit(problemSeeds.length > 0 ? 1 : 0);
}

main().catch((error) => {
  log(`FATAL ERROR: ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  pool.end();
  process.exit(1);
});

