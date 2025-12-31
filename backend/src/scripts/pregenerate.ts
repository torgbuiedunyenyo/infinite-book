/**
 * Pre-generation script for The Infinite Book
 * 
 * Generates pages 1-10 for all canonical seeds, using the full generation pipeline.
 * 
 * Features:
 * - Skips already-generated pages (idempotent)
 * - Waits for background tasks (book arc, chunk summaries) to complete
 * - Logs progress clearly for monitoring
 * - Can be re-run to resume from where it left off
 * 
 * Usage: npx ts-node src/scripts/pregenerate.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { getOrGeneratePage } from '../services/pageGenerator';
import { getPage } from '../services/database';

// The canonical seeds from routes/pages.ts
const CANONICAL_SEEDS = [
  "Out of Time",
  "On Time",
  "Ahead of Time",
  "For The Time Being",
  "From Time to Time",
  "In No Time",
  "Saving Time",
  "Time Wasted",
  "Time After Time",
  "About Time",
  "Killing Time",
  "Time Flies",
  "Time Will Tell",
  "Buying Time",
];

const PAGES_PER_SEED = 10;

// Delay between pages to allow background tasks (arc generation, chunk summaries) to complete
// Page 1 triggers arc generation; pages 5, 10 trigger chunk summaries
const DELAY_AFTER_PAGE_1 = 30000;       // 30s for book arc generation
const DELAY_AFTER_CHUNK_BOUNDARY = 45000; // 45s for chunk + momentum generation  
const DELAY_DEFAULT = 3000;             // 3s between regular pages

function getDelayForPage(pageNumber: number): number {
  if (pageNumber === 1) {
    return DELAY_AFTER_PAGE_1;
  }
  if (pageNumber % 5 === 0) {
    return DELAY_AFTER_CHUNK_BOUNDARY;
  }
  return DELAY_DEFAULT;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(message: string): void {
  console.log(`[${timestamp()}] ${message}`);
}

async function pregenerateSeed(seed: string, seedIndex: number): Promise<{ generated: number; skipped: number }> {
  log(`\n${'='.repeat(60)}`);
  log(`SEED [${seedIndex + 1}/${CANONICAL_SEEDS.length}]: "${seed}"`);
  log('='.repeat(60));
  
  let generated = 0;
  let skipped = 0;
  
  for (let page = 1; page <= PAGES_PER_SEED; page++) {
    const startTime = performance.now();
    
    try {
      // First check if page already exists (fast check)
      const existing = await getPage(seed, page);
      if (existing) {
        log(`  ○ Page ${page}/10 - Already exists (skipped)`);
        skipped++;
        continue;
      }
      
      log(`  → Page ${page}/10 - Generating...`);
      
      // Generate using full pipeline
      const { page: generatedPage, isNewDiscovery } = await getOrGeneratePage(
        seed,
        page,
        undefined,  // no referrer context for canonical seeds
        true        // isCanonicalSeed = true
      );
      
      const duration = ((performance.now() - startTime) / 1000).toFixed(1);
      
      if (isNewDiscovery) {
        const refList = generatedPage.references.map(r => r.text).join(', ');
        log(`  ✓ Page ${page}/10 - Generated in ${duration}s (${generatedPage.content.length} chars)`);
        log(`    References: [${refList || 'none'}]`);
        generated++;
        
        // Wait for background tasks to complete before next page
        if (page < PAGES_PER_SEED) {
          const delay = getDelayForPage(page);
          const delayReason = page === 1 ? 'book arc' : page % 5 === 0 ? 'chunk summary' : 'buffer';
          log(`    Waiting ${delay / 1000}s for ${delayReason}...`);
          await sleep(delay);
        }
      } else {
        log(`  ○ Page ${page}/10 - Already exists (${duration}s)`);
        skipped++;
      }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`  ✗ Page ${page}/10 - FAILED: ${errorMsg}`);
      // Continue to next page
    }
  }
  
  return { generated, skipped };
}

async function main(): Promise<void> {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════╗');
  log('║        THE INFINITE BOOK - PRE-GENERATION SCRIPT          ║');
  log('╠════════════════════════════════════════════════════════════╣');
  log(`║  Seeds: ${CANONICAL_SEEDS.length.toString().padEnd(49)}║`);
  log(`║  Pages per seed: ${PAGES_PER_SEED.toString().padEnd(40)}║`);
  log(`║  Total pages: ${(CANONICAL_SEEDS.length * PAGES_PER_SEED).toString().padEnd(43)}║`);
  log('╚════════════════════════════════════════════════════════════╝');
  
  const overallStart = performance.now();
  let totalGenerated = 0;
  let totalSkipped = 0;
  
  // Process seeds sequentially
  for (let i = 0; i < CANONICAL_SEEDS.length; i++) {
    const seed = CANONICAL_SEEDS[i];
    
    try {
      const { generated, skipped } = await pregenerateSeed(seed, i);
      totalGenerated += generated;
      totalSkipped += skipped;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`SEED FAILED: "${seed}" - ${errorMsg}`);
    }
    
    // Brief pause between seeds
    if (i < CANONICAL_SEEDS.length - 1) {
      log('\nPausing 10s before next seed...');
      await sleep(10000);
    }
  }
  
  const totalMinutes = ((performance.now() - overallStart) / 1000 / 60).toFixed(1);
  
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════╗');
  log('║              PRE-GENERATION COMPLETE                       ║');
  log('╠════════════════════════════════════════════════════════════╣');
  log(`║  Total time: ${totalMinutes.padEnd(44)} min ║`);
  log(`║  Pages generated: ${totalGenerated.toString().padEnd(39)}║`);
  log(`║  Pages skipped (already existed): ${totalSkipped.toString().padEnd(22)}║`);
  log('╚════════════════════════════════════════════════════════════╝');
  
  process.exit(0);
}

main().catch((error) => {
  log(`FATAL ERROR: ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

