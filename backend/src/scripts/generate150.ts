#!/usr/bin/env npx ts-node
/**
 * Generate 150 Pages Script for Railway experiment-past-ending deployment
 * 
 * This script generates pages 1-150 of "The Shape of Time" on the Railway
 * experiment-past-ending deployment, respecting all narrative context requirements:
 * 
 * Generation Order (enforced by API):
 * - Page 1: Generated first, triggers book arc creation
 * - Pages 2-5: Wait for book arc before generation
 * - Page 5: Triggers chunk summary (1-5) and running summary
 * - Pages 6+: Wait for book arc, chunk summaries, and running summary
 * 
 * Usage:
 *   RAILWAY_URL=https://your-app.railway.app npx ts-node src/scripts/generate150.ts
 *   
 *   Or set the URL in the script below.
 */

// Configuration - Railway experiment-past-ending deployment
const RAILWAY_BACKEND_URL = process.env.RAILWAY_URL || 'https://infinite-book-production-4bcf.up.railway.app';

const CORE_SEED = "The Shape of Time";
const TARGET_PAGE = 150;
const MAX_PAGE_RETRIES = 5;
const FETCH_TIMEOUT_MS = 300000; // 5 minutes per page (LLM generation can be slow)

// Progress tracking
interface GenerationStats {
  startTime: number;
  pagesGenerated: number;
  pagesFailed: number;
  currentPage: number;
  errors: string[];
  lastSuccessTime: number;
}

const stats: GenerationStats = {
  startTime: Date.now(),
  pagesGenerated: 0,
  pagesFailed: 0,
  currentPage: 0,
  errors: [],
  lastSuccessTime: Date.now(),
};

// ==================== API CALLS ====================

async function generatePage(pageNumber: number, retryCount: number = 0): Promise<boolean> {
  const url = `${RAILWAY_BACKEND_URL}/api/page?seed=${encodeURIComponent(CORE_SEED)}&page=${pageNumber}`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorBody = await response.text();
      const errorMsg = `HTTP ${response.status}: ${errorBody.slice(0, 200)}`;
      
      if (retryCount < MAX_PAGE_RETRIES - 1) {
        console.log(`    ⚠️  Page ${pageNumber} failed (attempt ${retryCount + 1}/${MAX_PAGE_RETRIES}): ${errorMsg}`);
        console.log(`    Waiting 15s before retry...`);
        await sleep(15000);
        return generatePage(pageNumber, retryCount + 1);
      }
      
      stats.errors.push(`Page ${pageNumber}: ${errorMsg}`);
      return false;
    }
    
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Retry on timeout or network errors
    if (retryCount < MAX_PAGE_RETRIES - 1) {
      console.log(`    ⚠️  Page ${pageNumber} failed (attempt ${retryCount + 1}/${MAX_PAGE_RETRIES}): ${errorMsg}`);
      console.log(`    Waiting 15s before retry...`);
      await sleep(15000);
      return generatePage(pageNumber, retryCount + 1);
    }
    
    stats.errors.push(`Page ${pageNumber}: ${errorMsg}`);
    return false;
  }
}

async function checkCurrentPage(): Promise<number> {
  // Check pages from TARGET_PAGE down to find the highest existing page
  // Binary search would be faster but this is simpler
  
  console.log('Checking current generation state...');
  
  for (let page = TARGET_PAGE; page >= 1; page--) {
    const url = `${RAILWAY_BACKEND_URL}/api/page?seed=${encodeURIComponent(CORE_SEED)}&page=${page}`;
    
    try {
      const response = await fetch(url, { 
        signal: AbortSignal.timeout(30000) 
      });
      
      if (response.ok) {
        const data = await response.json() as { isNewDiscovery?: boolean };
        if (!data.isNewDiscovery) {
          console.log(`  Found existing page ${page}`);
          return page;
        }
      }
    } catch {
      // Page doesn't exist or error, continue checking
    }
    
    // Don't spam the API
    if (page % 10 === 0) {
      console.log(`  Checking page ${page}...`);
    }
  }
  
  return 0;
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

function printProgress(): void {
  const elapsed = Date.now() - stats.startTime;
  const avgTimePerPage = stats.pagesGenerated > 0 ? elapsed / stats.pagesGenerated : 0;
  const remainingPages = TARGET_PAGE - stats.currentPage;
  const eta = avgTimePerPage * remainingPages;
  
  console.log('\n═══════════════════════════════════════');
  console.log('  PROGRESS REPORT');
  console.log('═══════════════════════════════════════');
  console.log(`  Current page: ${stats.currentPage}/${TARGET_PAGE}`);
  console.log(`  Pages generated this session: ${stats.pagesGenerated}`);
  console.log(`  Failed pages: ${stats.pagesFailed}`);
  console.log(`  Elapsed time: ${formatDuration(elapsed)}`);
  if (stats.pagesGenerated > 0) {
    console.log(`  Avg time per page: ${formatDuration(avgTimePerPage)}`);
    console.log(`  Estimated remaining: ${formatDuration(eta)}`);
  }
  console.log('═══════════════════════════════════════\n');
}

// ==================== MAIN ====================

async function main(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  GENERATE 150 PAGES - Railway experiment-past-ending      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  // Validate configuration
  if (RAILWAY_BACKEND_URL === 'SET_YOUR_RAILWAY_URL_HERE' || !RAILWAY_BACKEND_URL) {
    console.error('❌ ERROR: RAILWAY_URL not set!');
    console.error('   Set it via environment variable:');
    console.error('   RAILWAY_URL=https://your-app.railway.app npx ts-node src/scripts/generate150.ts');
    console.error('   Or edit the RAILWAY_BACKEND_URL constant in this script.');
    process.exit(1);
  }
  
  console.log(`Backend URL: ${RAILWAY_BACKEND_URL}`);
  console.log(`Target: "${CORE_SEED}" → page ${TARGET_PAGE}\n`);
  
  // Check current state
  const startPage = await checkCurrentPage();
  stats.currentPage = startPage;
  
  if (startPage >= TARGET_PAGE) {
    console.log(`\n✅ Target already reached! All ${TARGET_PAGE} pages exist.`);
    return;
  }
  
  console.log(`\nStarting from page ${startPage + 1} → ${TARGET_PAGE}`);
  console.log(`Pages to generate: ${TARGET_PAGE - startPage}\n`);
  
  // Generate pages sequentially
  for (let page = startPage + 1; page <= TARGET_PAGE; page++) {
    stats.currentPage = page;
    
    // Progress report every 5 pages
    if ((page - startPage) % 5 === 0 && page !== startPage + 1) {
      printProgress();
    }
    
    console.log(`📖 Generating page ${page}/${TARGET_PAGE}...`);
    const startTime = Date.now();
    
    const success = await generatePage(page);
    
    if (success) {
      const duration = Date.now() - startTime;
      stats.pagesGenerated++;
      stats.lastSuccessTime = Date.now();
      console.log(`   ✅ Page ${page} complete (${formatDuration(duration)})`);
    } else {
      stats.pagesFailed++;
      console.log(`   ❌ Page ${page} FAILED after ${MAX_PAGE_RETRIES} attempts`);
      
      // If we've had 3 consecutive failures, something is wrong
      if (stats.pagesFailed >= 3 && stats.pagesGenerated === 0) {
        console.error('\n❌ FATAL: Multiple failures with no progress. Check the Railway backend.');
        printProgress();
        process.exit(1);
      }
    }
    
    // Delay between pages
    // Extra delay at chunk boundaries (pages 5, 10, 15, etc.)
    // to let background tasks complete (chunk summaries, running summaries)
    if (page % 5 === 0) {
      console.log(`   ⏳ Chunk boundary - waiting 10s for summaries...`);
      await sleep(10000);
    } else {
      await sleep(2000); // Small delay between pages
    }
  }
  
  // Final report
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  GENERATION COMPLETE                                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  printProgress();
  
  if (stats.errors.length > 0) {
    console.log('Errors encountered:');
    stats.errors.forEach(err => console.log(`  - ${err}`));
  }
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

