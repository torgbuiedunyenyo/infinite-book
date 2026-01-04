import {
  Location,
  getCurrentLocation,
  setCurrentLocation,
  goBack,
  parseURL,
  setupPopStateHandler,
} from './navigation';
import {
  setPageNumber,
  setCurrentSeed,
  clearContent,
  setLoading,
  renderContent,
  appendChunk,
  finalizeStreaming,
  onReferenceClick,
  updateNavArrows,
  showWaitingMessage,
  onFavoriteToggle,
} from './renderer';
import { initSidebar, onBookSelect, onFavoriteSelect, isSidebarOpen } from './sidebar';
import { shouldShowTour, startTour } from './tour';
import { initSwipeNavigation } from './swipe';
import { PageData, Reference } from './types';
import { appLogger, apiLogger, cacheLogger } from './logger';
import { recordVisit, toggleFavorite, isFavorite } from './readingHistory';

const log = appLogger;

const prefetchCache = new Map<string, PageData>();
const prefetchInProgress = new Set<string>();

// Track pre-generation of pages that don't exist yet (separate from prefetch)
const preGenerationInProgress = new Set<string>();

// Queue for pre-generation work that couldn't start due to concurrent limit
interface PreGenQueueItem {
  seed: string;
  page: number;
  referrer?: ReferrerInfo;
  priority: 'high' | 'normal';  // 'high' for upcoming pages, 'normal' for references
}
const preGenerationQueue: PreGenQueueItem[] = [];
let queueProcessorRunning = false;

// Track the current page's content for referrer context
let currentPageContent: string | null = null;

// Track current page's references for pre-generation
let currentPageReferences: Reference[] = [];

// Track current reading position for continuous pre-generation chaining
let currentReadingPosition: { seed: string; page: number } | null = null;

// Track whether first navigation has completed (for tour)
let firstNavigationComplete = false;

// Configuration for aggressive pre-generation
const PREGENERATE_PAGES_AHEAD = 3;        // How many pages ahead to pre-generate
const PREGENERATE_REFERENCE_PAGES = 2;    // How many pages to pre-generate for each reference
const MAX_CONCURRENT_PREGENERATIONS = 3;  // Max concurrent pre-generation requests

// Stats tracking
let totalNavigations = 0;
let cacheHits = 0;
let cacheMisses = 0;
let prefetchCount = 0;
let preGenerationCount = 0;
let streamCount = 0;
let errorCount = 0;

// Extract references from raw text (for error recovery when 'complete' event wasn't received)
function extractReferencesFromText(text: string): Reference[] {
  const pattern = /\[\[([^\]]+)\]\]/g;
  const refs: Reference[] = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const refText = match[1];
    if (!refs.some(r => r.text === refText)) {
      refs.push({ text: refText, seed: refText });
    }
  }
  
  log.debug('Extracted references from text', {
    referenceCount: refs.length,
    references: refs.map(r => r.text),
  });
  
  return refs;
}

interface ReferrerInfo {
  seed: string;
  page: number;
}

function locationKey(seed: string, page: number): string {
  return `${seed}::${page}`;
}

async function fetchRandomSeed(): Promise<string> {
  apiLogger.info('Fetching random seed from server');
  const startTime = performance.now();
  
  try {
    const res = await fetch('/api/random-seed');
    const data = await res.json();
    const duration = performance.now() - startTime;
    
    apiLogger.info('Random seed received', {
      seed: data.seed,
      duration: `${duration.toFixed(2)}ms`,
    });
    
    return data.seed;
  } catch (error) {
    errorCount++;
    apiLogger.error('Failed to fetch random seed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Check if a specific page exists in the database.
 */
async function checkPageExists(seed: string, page: number): Promise<boolean> {
  apiLogger.debug('Checking if page exists', { seed, page });
  
  try {
    const res = await fetch(`/api/page/check?seed=${encodeURIComponent(seed)}&page=${page}`);
    const data = await res.json();
    
    apiLogger.debug('Page existence check result', {
      seed,
      page,
      exists: data.exists,
    });
    
    return data.exists;
  } catch (error) {
    apiLogger.error('Failed to check page existence', {
      seed,
      page,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Get the highest existing page number for a seed.
 * Returns 0 if no pages exist for this seed.
 */
async function getHighestExistingPage(seed: string): Promise<number> {
  apiLogger.debug('Getting highest existing page', { seed });
  
  try {
    const res = await fetch(`/api/page/highest?seed=${encodeURIComponent(seed)}`);
    const data = await res.json();
    
    apiLogger.debug('Highest page result', {
      seed,
      highestPage: data.highestPage,
      exists: data.exists,
    });
    
    return data.highestPage || 0;
  } catch (error) {
    apiLogger.error('Failed to get highest page', {
      seed,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

async function fetchPageStreaming(seed: string, page: number, referrer?: ReferrerInfo): Promise<void> {
  const key = locationKey(seed, page);
  streamCount++;
  
  log.separator(`STREAMING PAGE: "${seed}" p.${page}`);
  
  log.info('Starting page fetch (streaming)', {
    seed,
    page,
    hasReferrer: !!referrer,
    referrerSeed: referrer?.seed,
    referrerPage: referrer?.page,
    streamCount,
  });
  
  // Check prefetch cache first
  const cached = prefetchCache.get(key);
  if (cached) {
    prefetchCache.delete(key);
    cacheHits++;
    
    cacheLogger.info('Prefetch cache HIT', {
      key,
      contentLength: cached.content.length,
      cacheHits,
      cacheSize: prefetchCache.size,
    });
    
    currentPageContent = cached.content;
    renderContent(cached.content, cached.references);
    return;
  }
  
  cacheMisses++;
  cacheLogger.debug('Prefetch cache MISS', {
    key,
    cacheMisses,
    cacheSize: prefetchCache.size,
    inProgress: Array.from(prefetchInProgress),
  });
  
  clearContent();
  
  // Build URL with optional referrer context (for page 1 reached via reference click)
  let url = `/api/page/stream?seed=${encodeURIComponent(seed)}&page=${page}`;
  if (referrer && page === 1) {
    url += `&referrerSeed=${encodeURIComponent(referrer.seed)}&referrerPage=${referrer.page}`;
    log.debug('Including referrer context in request', {
      referrerSeed: referrer.seed,
      referrerPage: referrer.page,
    });
  }
  
  apiLogger.info('Opening SSE connection', { url });
  const startTime = performance.now();
  
  const eventSource = new EventSource(url);
  
  let references: Reference[] = [];
  let streamedContent = '';
  let chunkCount = 0;
  let firstChunkTime: number | null = null;
  let receivedExistingPage = false;  // Track if we got an existing page (no streaming needed)
  
  return new Promise((resolve, reject) => {
    eventSource.addEventListener('existing', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as PageData;
      const duration = performance.now() - startTime;
      
      apiLogger.info('SSE: Received existing page', {
        seed: data.seed,
        pageNumber: data.pageNumber,
        contentLength: data.content.length,
        referencesCount: data.references.length,
        duration: `${duration.toFixed(2)}ms`,
      });
      
      receivedExistingPage = true;  // Mark that we received an existing page
      currentPageContent = data.content;
      currentPageReferences = data.references;  // Track references for pre-generation
      references = data.references;
      renderContent(data.content, data.references);
    });
    
    eventSource.addEventListener('chunk', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      chunkCount++;
      streamedContent += data.text;
      
      if (firstChunkTime === null) {
        firstChunkTime = performance.now() - startTime;
        apiLogger.info('SSE: First chunk received', {
          timeToFirstChunk: `${firstChunkTime.toFixed(2)}ms`,
          chunkLength: data.text.length,
        });
      }
      
      // Log every 20th chunk
      if (chunkCount % 20 === 0) {
        apiLogger.debug('SSE: Streaming progress', {
          chunkCount,
          totalChars: streamedContent.length,
          elapsedTime: `${(performance.now() - startTime).toFixed(2)}ms`,
        });
      }
      
      appendChunk(streamedContent);  // Pass full accumulated text, not just the chunk
    });
    
    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      references = data.references;
      currentPageContent = streamedContent;
      currentPageReferences = data.references;  // Track references for pre-generation
      
      apiLogger.info('SSE: Generation complete', {
        seed: data.seed,
        pageNumber: data.pageNumber,
        referencesCount: references.length,
        references: references.map(r => r.text),
        isNewDiscovery: data.isNewDiscovery,
      });
    });
    
    eventSource.addEventListener('waiting', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      
      apiLogger.info('SSE: Waiting for context', {
        message: data.message,
        seed,
        page,
      });
      
      // Update the loading indicator text to show the waiting message
      showWaitingMessage(data.message);
    });
    
    eventSource.addEventListener('done', () => {
      const totalDuration = performance.now() - startTime;
      eventSource.close();
      
      // Only finalize streaming if we actually streamed content (not for existing pages)
      // Existing pages are already rendered via renderContent() in the 'existing' handler
      if (!receivedExistingPage) {
        // If we didn't get references from 'complete' event, extract them from text
        if (references.length === 0) {
          log.debug('No references from complete event, extracting from text');
          references = extractReferencesFromText(streamedContent);
        }
        
        finalizeStreaming(streamedContent, references);
      }
      
      apiLogger.info('SSE: Stream completed', {
        seed,
        page,
        totalDuration: `${totalDuration.toFixed(2)}ms`,
        timeToFirstChunk: firstChunkTime ? `${firstChunkTime.toFixed(2)}ms` : 'N/A',
        totalChunks: chunkCount,
        contentLength: receivedExistingPage ? 'existing' : streamedContent.length,
        referencesCount: references.length,
        wasExistingPage: receivedExistingPage,
      });
      
      resolve();
    });
    
    // Handle server-sent error events (access control errors, etc.)
    eventSource.addEventListener('error', (e: Event) => {
      // This handles the SSE event type "error" sent by the server
      if (e instanceof MessageEvent && e.data) {
        const duration = performance.now() - startTime;
        eventSource.close();
        errorCount++;
        
        let errorData: any = null;
        try {
          errorData = JSON.parse(e.data);
        } catch {
          // Not JSON
        }
        
        if (errorData?.error === 'sequential_access_required') {
          apiLogger.warn('SSE: Sequential access required', {
            seed,
            page,
            requiredPage: errorData.requiredPage,
            duration: `${duration.toFixed(2)}ms`,
          });
          reject(new Error(`sequential_access_required:${errorData.requiredPage}`));
          return;
        }
        
        if (errorData?.error === 'invalid_seed_access') {
          apiLogger.warn('SSE: Invalid seed access', {
            seed,
            reason: errorData.reason,
            duration: `${duration.toFixed(2)}ms`,
          });
          reject(new Error('invalid_seed_access'));
          return;
        }
        
        apiLogger.error('SSE: Server error event', {
          seed,
          page,
          errorData,
          duration: `${duration.toFixed(2)}ms`,
        });
        reject(new Error(errorData?.message || 'Server error'));
        return;
      }
    });
    
    // Handle EventSource connection errors (network issues, etc.)
    eventSource.onerror = () => {
      const duration = performance.now() - startTime;
      eventSource.close();
      errorCount++;
      
      apiLogger.error('SSE: Connection error', {
        seed,
        page,
        duration: `${duration.toFixed(2)}ms`,
        chunksReceived: chunkCount,
        contentReceived: streamedContent.length,
        errorCount,
        wasExistingPage: receivedExistingPage,
      });
      
      // Only finalize if we were streaming (not for existing pages which are already rendered)
      if (!receivedExistingPage && streamedContent.length > 0) {
        // Still finalize the streamed content even on error - content was already displayed
        // Extract references from the streamed text since we may not have received the 'complete' event
        const extractedRefs = extractReferencesFromText(streamedContent);
        finalizeStreaming(streamedContent, extractedRefs);
      }
      reject(new Error('Connection error'));
    };
  });
}

async function prefetchPage(seed: string, page: number): Promise<void> {
  const key = locationKey(seed, page);
  
  if (prefetchCache.has(key)) {
    cacheLogger.debug('Prefetch skipped: already cached', { key });
    return;
  }
  
  if (prefetchInProgress.has(key)) {
    cacheLogger.debug('Prefetch skipped: already in progress', { key });
    return;
  }
  
  prefetchInProgress.add(key);
  prefetchCount++;
  
  cacheLogger.info('Starting prefetch', {
    seed,
    page,
    key,
    prefetchCount,
    cacheSize: prefetchCache.size,
  });
  
  const startTime = performance.now();
  
  try {
    const res = await fetch(`/api/page?seed=${encodeURIComponent(seed)}&page=${page}`);
    const duration = performance.now() - startTime;
    
    if (res.ok) {
      const data = await res.json() as PageData;
      prefetchCache.set(key, data);
      
      cacheLogger.info('Prefetch completed', {
        key,
        contentLength: data.content.length,
        isNewDiscovery: data.isNewDiscovery,
        duration: `${duration.toFixed(2)}ms`,
        cacheSize: prefetchCache.size,
      });
    } else {
      cacheLogger.warn('Prefetch failed: bad response', {
        key,
        status: res.status,
        duration: `${duration.toFixed(2)}ms`,
      });
    }
  } catch (e) {
    const duration = performance.now() - startTime;
    cacheLogger.warn('Prefetch failed: network error', {
      key,
      error: e instanceof Error ? e.message : String(e),
      duration: `${duration.toFixed(2)}ms`,
    });
    // Prefetch failure is non-critical
  } finally {
    prefetchInProgress.delete(key);
  }
}

// ==================== AGGRESSIVE PRE-GENERATION ====================
// Pre-generate pages that don't exist yet, so readers rarely see loading screens

/**
 * Process the pre-generation queue. Runs continuously while there's work to do.
 * Respects the concurrent limit and processes high-priority items first.
 */
async function processPreGenerationQueue(): Promise<void> {
  if (queueProcessorRunning) {
    return; // Already running
  }
  
  queueProcessorRunning = true;
  
  while (preGenerationQueue.length > 0) {
    // Wait if we're at the concurrent limit
    if (preGenerationInProgress.size >= MAX_CONCURRENT_PREGENERATIONS) {
      // Wait a bit and check again
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }
    
    // Sort queue: high priority first, then by order added
    preGenerationQueue.sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (a.priority !== 'high' && b.priority === 'high') return 1;
      return 0;
    });
    
    const item = preGenerationQueue.shift();
    if (!item) break;
    
    const key = locationKey(item.seed, item.page);
    
    // Skip if already done while waiting in queue
    if (prefetchCache.has(key) || preGenerationInProgress.has(key)) {
      continue;
    }
    
    // Start the generation (don't await - let it run in background)
    executePreGeneration(item.seed, item.page, item.referrer);
  }
  
  queueProcessorRunning = false;
}

/**
 * Actually execute a pre-generation request.
 * This is the internal function that does the work.
 * 
 * After successful generation, chains to the next page if:
 * - This is for the current book (same seed as reading position)
 * - The next page is within PREGENERATE_PAGES_AHEAD of reading position
 * 
 * This ensures continuous pre-generation up to 3 pages ahead.
 */
async function executePreGeneration(
  seed: string,
  page: number,
  referrer?: ReferrerInfo
): Promise<PageData | null> {
  const key = locationKey(seed, page);
  
  preGenerationInProgress.add(key);
  preGenerationCount++;
  
  cacheLogger.info('Starting PRE-GENERATION (new page)', {
    seed,
    page,
    key,
    hasReferrer: !!referrer,
    referrerSeed: referrer?.seed,
    preGenerationCount,
    inProgress: preGenerationInProgress.size,
    queueLength: preGenerationQueue.length,
  });
  
  const startTime = performance.now();
  
  try {
    // Build URL with optional referrer context (needed for page 1 of new books)
    let url = `/api/page?seed=${encodeURIComponent(seed)}&page=${page}`;
    if (referrer && page === 1) {
      url += `&referrerSeed=${encodeURIComponent(referrer.seed)}&referrerPage=${referrer.page}`;
    }
    
    const res = await fetch(url);
    const duration = performance.now() - startTime;
    
    if (res.ok) {
      const data = await res.json() as PageData;
      prefetchCache.set(key, data);
      
      cacheLogger.info('PRE-GENERATION completed', {
        key,
        contentLength: data.content.length,
        isNewDiscovery: data.isNewDiscovery,
        duration: `${duration.toFixed(2)}ms`,
        cacheSize: prefetchCache.size,
      });
      
      // Chain to next page if within range of current reading position
      // This ensures continuous generation up to PREGENERATE_PAGES_AHEAD
      if (currentReadingPosition && seed === currentReadingPosition.seed) {
        const nextPage = page + 1;
        const maxPage = currentReadingPosition.page + PREGENERATE_PAGES_AHEAD;
        
        if (nextPage <= maxPage) {
          const nextKey = locationKey(seed, nextPage);
          const nextCached = prefetchCache.has(nextKey);
          const nextInProgress = preGenerationInProgress.has(nextKey);
          const nextQueued = preGenerationQueue.some(q => q.seed === seed && q.page === nextPage);
          
          if (!nextCached && !nextInProgress && !nextQueued) {
            cacheLogger.info('Chaining to next page after successful generation', {
              seed,
              completedPage: page,
              nextPage,
              readingPosition: currentReadingPosition.page,
              maxPage,
            });
            // Queue next page with high priority (upcoming pages in current book)
            queuePreGeneration(seed, nextPage, undefined, 'high');
          }
        }
      }
      
      return data;
    } else {
      const errorBody = await res.text();
      cacheLogger.warn('Pre-generation failed: bad response', {
        key,
        status: res.status,
        error: errorBody.slice(0, 200),
        duration: `${duration.toFixed(2)}ms`,
      });
      return null;
    }
  } catch (e) {
    const duration = performance.now() - startTime;
    cacheLogger.warn('Pre-generation failed: network error', {
      key,
      error: e instanceof Error ? e.message : String(e),
      duration: `${duration.toFixed(2)}ms`,
    });
    return null;
  } finally {
    preGenerationInProgress.delete(key);
    // Kick the queue processor in case there's more work
    processPreGenerationQueue();
  }
}

/**
 * Queue a page for pre-generation.
 * If under the concurrent limit, starts immediately. Otherwise queues for later.
 * Returns immediately (does not wait for generation to complete).
 */
function queuePreGeneration(
  seed: string,
  page: number,
  referrer?: ReferrerInfo,
  priority: 'high' | 'normal' = 'normal'
): void {
  const key = locationKey(seed, page);
  
  // Skip if already cached
  if (prefetchCache.has(key)) {
    cacheLogger.debug('Pre-generation skipped: already cached', { key });
    return;
  }
  
  // Skip if already in progress
  if (preGenerationInProgress.has(key)) {
    cacheLogger.debug('Pre-generation skipped: already in progress', { key });
    return;
  }
  
  // Skip if already in queue
  if (preGenerationQueue.some(item => item.seed === seed && item.page === page)) {
    cacheLogger.debug('Pre-generation skipped: already in queue', { key });
    return;
  }
  
  // If under limit, start immediately
  if (preGenerationInProgress.size < MAX_CONCURRENT_PREGENERATIONS) {
    executePreGeneration(seed, page, referrer);
  } else {
    // Add to queue
    cacheLogger.info('Pre-generation queued (at concurrent limit)', {
      key,
      priority,
      queueLength: preGenerationQueue.length + 1,
      inProgress: preGenerationInProgress.size,
    });
    preGenerationQueue.push({ seed, page, referrer, priority });
    // Make sure queue processor is running
    processPreGenerationQueue();
  }
}

/**
 * Pre-generate a single page in the background.
 * This triggers actual page generation on the server if the page doesn't exist.
 * Fire-and-forget: we don't wait for completion.
 * 
 * @deprecated Use queuePreGeneration for fire-and-forget, or executePreGenerationWithResult for awaitable.
 */
async function preGeneratePage(
  seed: string, 
  page: number, 
  referrer?: ReferrerInfo
): Promise<PageData | null> {
  const key = locationKey(seed, page);
  
  // Skip if already cached or in progress
  if (prefetchCache.has(key)) {
    cacheLogger.debug('Pre-generation skipped: already cached', { key });
    return prefetchCache.get(key)!;
  }
  
  if (preGenerationInProgress.has(key) || prefetchInProgress.has(key)) {
    cacheLogger.debug('Pre-generation skipped: already in progress', { key });
    return null;
  }
  
  // If at limit, queue it instead of dropping
  if (preGenerationInProgress.size >= MAX_CONCURRENT_PREGENERATIONS) {
    cacheLogger.info('Pre-generation queued (legacy function, at limit)', { 
      key, 
      currentCount: preGenerationInProgress.size,
      max: MAX_CONCURRENT_PREGENERATIONS,
    });
    queuePreGeneration(seed, page, referrer, 'normal');
    return null; // Still return null since we're not waiting
  }
  
  return executePreGeneration(seed, page, referrer);
}

/**
 * Pre-generate upcoming pages in the current book.
 * Generates pages N+1, N+2, N+3... ahead of the reader.
 * Pages must be generated sequentially (can't skip), so we chain them.
 * 
 * Uses 'high' priority since upcoming pages are more likely to be navigated to.
 */
async function preGenerateUpcomingPages(seed: string, currentPage: number): Promise<void> {
  cacheLogger.info('Starting upstream page pre-generation', {
    seed,
    currentPage,
    pagesAhead: PREGENERATE_PAGES_AHEAD,
  });
  
  // First, check existence of all pages we might generate (fast parallel checks)
  const pageChecks = await Promise.all(
    Array.from({ length: PREGENERATE_PAGES_AHEAD }, async (_, i) => {
      const targetPage = currentPage + i + 1;
      const key = locationKey(seed, targetPage);
      const cached = prefetchCache.has(key);
      const exists = cached || await checkPageExists(seed, targetPage);
      return { targetPage, key, cached, exists };
    })
  );
  
  // Process pages - queue generations, prefetch existing
  let canGenerate = true; // Track if previous page exists for chain
  
  for (const { targetPage, key, cached, exists } of pageChecks) {
    if (cached) {
      cacheLogger.debug('Upcoming page already cached', { seed, targetPage });
      continue;
    }
    
    if (exists) {
      // Page exists but not cached - prefetch it
      cacheLogger.debug('Upcoming page exists, prefetching', { seed, targetPage });
      prefetchPage(seed, targetPage);
    } else if (canGenerate) {
      // Page doesn't exist - check if we can generate it
      const prevPage = targetPage - 1;
      const prevKey = locationKey(seed, prevPage);
      const prevExists = prefetchCache.has(prevKey) || 
                         pageChecks.find(c => c.targetPage === prevPage)?.exists ||
                         await checkPageExists(seed, prevPage);
      
      if (prevExists) {
        cacheLogger.info('Queueing upcoming page (high priority)', { 
          seed, 
          targetPage,
        });
        
        // Queue with high priority (upcoming pages are more important)
        queuePreGeneration(seed, targetPage, undefined, 'high');
      } else {
        // Previous page doesn't exist - can't generate this or subsequent pages
        cacheLogger.debug('Upstream pre-generation chain stopped: previous page missing', {
          seed,
          targetPage,
          prevPage,
        });
        canGenerate = false;
      }
    }
  }
  
  cacheLogger.info('Upstream page pre-generation queued', {
    seed,
    currentPage,
    cacheSize: prefetchCache.size,
    queueLength: preGenerationQueue.length,
  });
}

/**
 * Pre-generate pages for [[reference]] books found on the current page.
 * Generates page 1 (with referrer context) and page 2 for each reference.
 * 
 * Uses the queue system to handle all references without blocking.
 * Reference pages are 'normal' priority (upcoming pages are 'high').
 */
async function preGenerateReferences(
  references: Reference[],
  referrerSeed: string,
  referrerPage: number
): Promise<void> {
  if (references.length === 0) {
    return;
  }
  
  cacheLogger.info('Starting reference pre-generation', {
    referenceCount: references.length,
    references: references.map(r => r.seed),
    referrerSeed,
    referrerPage,
  });
  
  const referrer: ReferrerInfo = { seed: referrerSeed, page: referrerPage };
  
  // Check existence for all references in parallel (fast DB lookups)
  const existenceChecks = await Promise.all(
    references.map(async (ref) => {
      const refSeed = ref.seed;
      const page1Key = locationKey(refSeed, 1);
      const page1Cached = prefetchCache.has(page1Key);
      const page1Exists = page1Cached || await checkPageExists(refSeed, 1);
      
      let page2Exists = false;
      if (page1Exists && PREGENERATE_REFERENCE_PAGES >= 2) {
        const page2Key = locationKey(refSeed, 2);
        page2Exists = prefetchCache.has(page2Key) || await checkPageExists(refSeed, 2);
      }
      
      return { refSeed, page1Exists, page1Cached, page2Exists };
    })
  );
  
  // Queue all needed generations
  for (const check of existenceChecks) {
    const { refSeed, page1Exists, page1Cached, page2Exists } = check;
    
    if (!page1Exists) {
      // Queue page 1 generation with referrer context
      cacheLogger.info('Queueing reference page 1', {
        refSeed,
        referrerSeed,
        referrerPage,
      });
      queuePreGeneration(refSeed, 1, referrer, 'normal');
      
      // Don't queue page 2 yet - server will reject it until page 1 exists
      // The next navigation to this reference will trigger page 2 pre-generation
    } else {
      // Page 1 exists
      if (!page1Cached) {
        // Prefetch page 1 (fast - already exists)
        prefetchPage(refSeed, 1);
      }
      
      if (PREGENERATE_REFERENCE_PAGES >= 2 && !page2Exists) {
        // Queue page 2 generation
        cacheLogger.info('Queueing reference page 2 (page 1 exists)', { refSeed });
        queuePreGeneration(refSeed, 2, undefined, 'normal');
      } else if (page2Exists && !prefetchCache.has(locationKey(refSeed, 2))) {
        // Page 2 exists but not cached - prefetch it
        prefetchPage(refSeed, 2);
      }
    }
  }
  
  cacheLogger.info('Reference pre-generation queued', {
    referenceCount: references.length,
    cacheSize: prefetchCache.size,
    inProgressCount: preGenerationInProgress.size,
    queueLength: preGenerationQueue.length,
  });
}

/**
 * Orchestrate all pre-generation after a successful navigation.
 * This is called after the page loads to aggressively prepare content.
 */
async function triggerAggressivePreGeneration(
  seed: string,
  page: number,
  references: Reference[]
): Promise<void> {
  cacheLogger.separator('AGGRESSIVE PRE-GENERATION');
  
  cacheLogger.info('Starting aggressive pre-generation', {
    seed,
    page,
    referenceCount: references.length,
    pagesAhead: PREGENERATE_PAGES_AHEAD,
    refPagesEach: PREGENERATE_REFERENCE_PAGES,
  });
  
  // Run upcoming pages and reference pre-generation in parallel
  // (they're independent of each other)
  await Promise.all([
    // Pre-generate upcoming pages in current book
    preGenerateUpcomingPages(seed, page),
    
    // Pre-generate reference book pages
    preGenerateReferences(references, seed, page),
  ]);
  
  cacheLogger.info('Aggressive pre-generation complete', {
    cacheSize: prefetchCache.size,
    inProgressCount: preGenerationInProgress.size,
  });
}

async function navigateTo(seed: string, page: number, referrer?: ReferrerInfo): Promise<void> {
  totalNavigations++;
  
  log.separator(`NAVIGATION #${totalNavigations}`);
  
  log.info('Navigating to page', {
    seed,
    page,
    hasReferrer: !!referrer,
    referrerSeed: referrer?.seed,
    totalNavigations,
    cacheHitRate: totalNavigations > 1 ? `${((cacheHits / (totalNavigations - 1)) * 100).toFixed(1)}%` : 'N/A',
  });
  
  // Track reading position for continuous pre-generation chaining
  currentReadingPosition = { seed, page };
  
  // Record this visit to reading history
  recordVisit(seed, page);
  
  setCurrentLocation({ seed, page });
  setCurrentSeed(seed);
  setPageNumber(page, isFavorite(seed, page));
  updateNavArrows(page);
  setLoading(true);
  
  // Scroll to top of page when navigating
  window.scrollTo(0, 0);
  
  const startTime = performance.now();
  
  try {
    await fetchPageStreaming(seed, page, referrer);
    
    const duration = performance.now() - startTime;
    log.info('Navigation complete', {
      seed,
      page,
      duration: `${duration.toFixed(2)}ms`,
    });
    
    // Start tour after first successful navigation
    if (!firstNavigationComplete) {
      firstNavigationComplete = true;
      if (shouldShowTour()) {
        // Slight delay to let content settle and be visible
        setTimeout(() => {
          startTour();
        }, 800);
      }
    }
    
    // Prefetch previous page (always fast - already exists)
    if (page > 1) {
      prefetchPage(seed, page - 1);
    }
    
    // Trigger aggressive pre-generation of upcoming pages and references
    // This runs in the background - don't await it
    triggerAggressivePreGeneration(seed, page, currentPageReferences).catch(e => {
      log.warn('Aggressive pre-generation failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    });
  } catch (e) {
    const duration = performance.now() - startTime;
    const errorMessage = e instanceof Error ? e.message : String(e);
    
    // Handle access control errors
    if (errorMessage.startsWith('sequential_access_required:')) {
      const requiredPage = parseInt(errorMessage.split(':')[1], 10);
      log.warn('Sequential access required - redirecting', {
        seed,
        requestedPage: page,
        requiredPage,
        duration: `${duration.toFixed(2)}ms`,
      });
      // Navigate to the required page instead
      setLoading(false);
      navigateTo(seed, requiredPage);
      return;
    }
    
    if (errorMessage === 'invalid_seed_access') {
      log.warn('Invalid seed access - falling back to random seed', {
        seed,
        page,
        duration: `${duration.toFixed(2)}ms`,
      });
      // Fall back to a random canonical seed
      setLoading(false);
      const randomSeed = await fetchRandomSeed();
      navigateTo(randomSeed, 1);
      return;
    }
    
    log.error('Navigation failed', {
      seed,
      page,
      duration: `${duration.toFixed(2)}ms`,
      error: errorMessage,
    });
  } finally {
    setLoading(false);
  }
}

function handleNavLeft(): void {
  const loc = getCurrentLocation();
  
  log.debug('Left navigation triggered', {
    currentSeed: loc?.seed,
    currentPage: loc?.page,
    canGoLeft: loc && loc.page > 1,
  });
  
  if (loc && loc.page > 1) {
    log.info('Flipping backward', {
      from: loc.page,
      to: loc.page - 1,
    });
    navigateTo(loc.seed, loc.page - 1);
  } else {
    log.debug('At first page, cannot go left');
  }
}

function handleNavRight(): void {
  const loc = getCurrentLocation();
  
  log.debug('Right navigation triggered', {
    currentSeed: loc?.seed,
    currentPage: loc?.page,
  });
  
  if (loc) {
    log.info('Flipping forward', {
      from: loc.page,
      to: loc.page + 1,
    });
    navigateTo(loc.seed, loc.page + 1);
  }
}

function handleReferenceClick(seed: string): void {
  log.separator(`REFERENCE CLICKED: "${seed}"`);
  
  // Pass the current location as referrer context so the new book
  // can be contextualized by where the reference was clicked
  const currentLoc = getCurrentLocation();
  const referrer = currentLoc ? { seed: currentLoc.seed, page: currentLoc.page } : undefined;
  
  log.info('Following reference to new book', {
    referenceSeed: seed,
    fromSeed: referrer?.seed,
    fromPage: referrer?.page,
  });
  
  navigateTo(seed, 1, referrer);
}

function handleKeyDown(e: KeyboardEvent): void {
  // Don't handle navigation keys when sidebar is open (let sidebar handle its own keys)
  if (isSidebarOpen() && e.key !== 'Escape' && e.key !== 'l') {
    return;
  }
  
  log.debug('Key pressed', {
    key: e.key,
    code: e.code,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
  });
  
  if (e.key === 'ArrowLeft') {
    handleNavLeft();
  } else if (e.key === 'ArrowRight') {
    handleNavRight();
  } else if (e.key === 'Backspace') {
    // Don't intercept backspace when typing in an input
    if (document.activeElement instanceof HTMLInputElement || 
        document.activeElement instanceof HTMLTextAreaElement) {
      return;
    }
    
    log.info('Backspace pressed - attempting to go back in history');
    const prev = goBack();
    if (prev) {
      log.info('Going back in history', {
        toSeed: prev.seed,
        toPage: prev.page,
      });
      setPageNumber(prev.page);
      updateNavArrows(prev.page);
      setLoading(true);
      window.scrollTo(0, 0);
      
      fetchPageStreaming(prev.seed, prev.page).then(() => {
        // Prefetch previous page
        if (prev.page > 1) {
          prefetchPage(prev.seed, prev.page - 1);
        }
        
        // Trigger aggressive pre-generation
        triggerAggressivePreGeneration(prev.seed, prev.page, currentPageReferences).catch(e => {
          log.warn('Aggressive pre-generation failed (backspace)', {
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }).catch((e) => {
        log.error('Navigation via backspace failed', {
          seed: prev.seed,
          page: prev.page,
          error: e instanceof Error ? e.message : String(e),
        });
      }).finally(() => {
        setLoading(false);
      });
    } else {
      log.debug('No history to go back to');
    }
  }
}

async function init(): Promise<void> {
  log.separator('THE INFINITE BOOK - INITIALIZING');
  
  log.info('Starting application initialization');
  
  // Initialize the library sidebar
  log.debug('Initializing library sidebar');
  initSidebar();
  
  // Set up sidebar book selection handler
  onBookSelect((seed: string) => {
    log.info('Book selected from sidebar', { seed });
    navigateTo(seed, 1);
  });
  
  // Set up sidebar favorite selection handler (navigates to specific page)
  onFavoriteSelect((seed: string, page: number) => {
    log.info('Favorite selected from sidebar', { seed, page });
    navigateTo(seed, page);
  });
  
  // Set up favorite toggle handler
  onFavoriteToggle((seed: string, page: number) => {
    log.info('Favorite toggled', { seed, page });
    const newState = toggleFavorite(seed, page);
    log.info('Favorite state changed', { seed, page, isFavorite: newState });
    return newState;
  });
  
  // Set up click handlers
  log.debug('Setting up navigation click handlers');
  document.getElementById('nav-left')!.addEventListener('click', handleNavLeft);
  document.getElementById('nav-right')!.addEventListener('click', handleNavRight);
  
  // Set up keyboard handlers
  log.debug('Setting up keyboard handlers');
  document.addEventListener('keydown', handleKeyDown);
  
  // Set up swipe navigation for mobile
  log.debug('Setting up swipe navigation');
  const bookEl = document.getElementById('book');
  if (bookEl) {
    initSwipeNavigation({
      element: bookEl,
      minDistance: 50,        // Minimum 50px horizontal swipe
      maxVerticalRatio: 0.75, // Allow up to 75% vertical deviation
      onSwipeLeft: handleNavRight,  // Swipe left = next page
      onSwipeRight: handleNavLeft,  // Swipe right = previous page
    });
  }
  
  // Set up reference click handler
  log.debug('Setting up reference click handler');
  onReferenceClick(handleReferenceClick);
  
  // Set up browser history handler
  log.debug('Setting up browser history (popstate) handler');
  setupPopStateHandler((loc) => {
    log.info('Browser history navigation', {
      seed: loc.seed,
      page: loc.page,
    });
    navigateTo(loc.seed, loc.page);
  });
  
  // Parse initial URL
  log.debug('Parsing initial URL');
  let location = parseURL();
  
  if (location) {
    log.info('URL location detected, validating access', {
      seed: location.seed,
      page: location.page,
    });
    
    // Check if this specific page exists
    const pageExists = await checkPageExists(location.seed, location.page);
    
    if (pageExists) {
      // Page exists - safe to navigate directly
      log.info('URL page exists, navigating directly', {
        seed: location.seed,
        page: location.page,
      });
    } else {
      // Page doesn't exist - check if any pages exist for this seed
      const highestPage = await getHighestExistingPage(location.seed);
      
      if (highestPage > 0) {
        // Seed exists but requested page doesn't - redirect to highest existing page
        log.warn('URL page does not exist, redirecting to highest existing page', {
          seed: location.seed,
          requestedPage: location.page,
          redirectingTo: highestPage,
        });
        location = { seed: location.seed, page: highestPage };
      } else {
        // Seed doesn't exist at all - start from a random canonical seed
        log.warn('URL seed does not exist, starting from random seed', {
          attemptedSeed: location.seed,
        });
        const randomSeed = await fetchRandomSeed();
        location = { seed: randomSeed, page: 1 };
      }
    }
  } else {
    log.info('No URL location, fetching random seed');
    const seed = await fetchRandomSeed();
    location = { seed, page: 1 };
    log.info('Starting from random seed', {
      seed: location.seed,
    });
  }
  
  log.separator('INITIALIZATION COMPLETE - STARTING NAVIGATION');
  
  navigateTo(location.seed, location.page);
}

// Log startup
log.info('App module loaded', {
  timestamp: new Date().toISOString(),
  userAgent: navigator.userAgent.slice(0, 100),
});

init();
