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
  clearContent,
  setLoading,
  renderContent,
  appendChunk,
  finalizeStreaming,
  onReferenceClick,
  updateNavArrows,
} from './renderer';
import { initSidebar, onBookSelect, isSidebarOpen } from './sidebar';
import { shouldShowTour, startTour } from './tour';
import { initSwipeNavigation } from './swipe';
import { PageData, Reference } from './types';
import { appLogger, apiLogger, cacheLogger } from './logger';

const log = appLogger;

const prefetchCache = new Map<string, PageData>();
const prefetchInProgress = new Set<string>();

// Track the current page's content for referrer context
let currentPageContent: string | null = null;

// Track whether first navigation has completed (for tour)
let firstNavigationComplete = false;

// Stats tracking
let totalNavigations = 0;
let cacheHits = 0;
let cacheMisses = 0;
let prefetchCount = 0;
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
      
      apiLogger.info('SSE: Generation complete', {
        seed: data.seed,
        pageNumber: data.pageNumber,
        referencesCount: references.length,
        references: references.map(r => r.text),
        isNewDiscovery: data.isNewDiscovery,
      });
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
  
  setCurrentLocation({ seed, page });
  setPageNumber(page);
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
    
    // Prefetch adjacent pages
    log.debug('Starting prefetch of adjacent pages', {
      nextPage: page + 1,
      prevPage: page > 1 ? page - 1 : 'N/A',
    });
    
    prefetchPage(seed, page + 1);
    if (page > 1) {
      prefetchPage(seed, page - 1);
    }
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
        // Prefetch adjacent pages
        log.debug('Starting prefetch of adjacent pages after backspace', {
          nextPage: prev.page + 1,
          prevPage: prev.page > 1 ? prev.page - 1 : 'N/A',
        });
        prefetchPage(prev.seed, prev.page + 1);
        if (prev.page > 1) {
          prefetchPage(prev.seed, prev.page - 1);
        }
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
