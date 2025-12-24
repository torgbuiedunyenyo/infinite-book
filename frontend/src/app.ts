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
} from './renderer';
import { PageData, Reference } from './types';

const prefetchCache = new Map<string, PageData>();
const prefetchInProgress = new Set<string>();

// Track the current page's content for referrer context
let currentPageContent: string | null = null;

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
  const res = await fetch('/api/random-seed');
  const data = await res.json();
  return data.seed;
}

async function fetchPageStreaming(seed: string, page: number, referrer?: ReferrerInfo): Promise<void> {
  const key = locationKey(seed, page);
  
  const cached = prefetchCache.get(key);
  if (cached) {
    prefetchCache.delete(key);
    currentPageContent = cached.content;
    renderContent(cached.content, cached.references);
    return;
  }
  
  clearContent();
  
  // Build URL with optional referrer context (for page 1 reached via reference click)
  let url = `/api/page/stream?seed=${encodeURIComponent(seed)}&page=${page}`;
  if (referrer && page === 1) {
    url += `&referrerSeed=${encodeURIComponent(referrer.seed)}&referrerPage=${referrer.page}`;
  }
  
  const eventSource = new EventSource(url);
  
  let references: Reference[] = [];
  let streamedContent = '';
  
  return new Promise((resolve, reject) => {
    eventSource.addEventListener('existing', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as PageData;
      currentPageContent = data.content;
      renderContent(data.content, data.references);
    });
    
    eventSource.addEventListener('chunk', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      streamedContent += data.text;
      appendChunk(streamedContent);  // Pass full accumulated text, not just the chunk
    });
    
    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      references = data.references;
      currentPageContent = streamedContent;
    });
    
    eventSource.addEventListener('done', () => {
      eventSource.close();
      // Always finalize to remove cursor and convert [[refs]] to links
      // If we didn't get references from 'complete' event, extract them from text
      if (references.length === 0) {
        references = extractReferencesFromText(streamedContent);
      }
      finalizeStreaming(streamedContent, references);
      resolve();
    });
    
    eventSource.addEventListener('error', (e) => {
      eventSource.close();
      // Still finalize the streamed content even on error - content was already displayed
      // Extract references from the streamed text since we may not have received the 'complete' event
      const extractedRefs = extractReferencesFromText(streamedContent);
      finalizeStreaming(streamedContent, extractedRefs);
      reject(new Error('Stream error'));
    });
  });
}

async function prefetchPage(seed: string, page: number): Promise<void> {
  const key = locationKey(seed, page);
  
  if (prefetchCache.has(key) || prefetchInProgress.has(key)) {
    return;
  }
  
  prefetchInProgress.add(key);
  
  try {
    const res = await fetch(`/api/page?seed=${encodeURIComponent(seed)}&page=${page}`);
    if (res.ok) {
      const data = await res.json() as PageData;
      prefetchCache.set(key, data);
    }
  } catch (e) {
    // Prefetch failure is non-critical
  } finally {
    prefetchInProgress.delete(key);
  }
}

async function navigateTo(seed: string, page: number, referrer?: ReferrerInfo): Promise<void> {
  setCurrentLocation({ seed, page });
  setPageNumber(page);
  setLoading(true);
  
  try {
    await fetchPageStreaming(seed, page, referrer);
    
    prefetchPage(seed, page + 1);
    if (page > 1) {
      prefetchPage(seed, page - 1);
    }
  } catch (e) {
    console.error('Navigation error:', e);
  } finally {
    setLoading(false);
  }
}

function handleNavLeft(): void {
  const loc = getCurrentLocation();
  if (loc && loc.page > 1) {
    navigateTo(loc.seed, loc.page - 1);
  }
}

function handleNavRight(): void {
  const loc = getCurrentLocation();
  if (loc) {
    navigateTo(loc.seed, loc.page + 1);
  }
}

function handleReferenceClick(seed: string): void {
  // Pass the current location as referrer context so the new book
  // can be contextualized by where the reference was clicked
  const currentLoc = getCurrentLocation();
  const referrer = currentLoc ? { seed: currentLoc.seed, page: currentLoc.page } : undefined;
  navigateTo(seed, 1, referrer);
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'ArrowLeft') {
    handleNavLeft();
  } else if (e.key === 'ArrowRight') {
    handleNavRight();
  } else if (e.key === 'Backspace') {
    const prev = goBack();
    if (prev) {
      setPageNumber(prev.page);
      fetchPageStreaming(prev.seed, prev.page);
    }
  }
}

async function init(): Promise<void> {
  document.getElementById('nav-left')!.addEventListener('click', handleNavLeft);
  document.getElementById('nav-right')!.addEventListener('click', handleNavRight);
  
  document.addEventListener('keydown', handleKeyDown);
  
  onReferenceClick(handleReferenceClick);
  
  setupPopStateHandler((loc) => {
    navigateTo(loc.seed, loc.page);
  });
  
  let location = parseURL();
  
  if (!location) {
    const seed = await fetchRandomSeed();
    location = { seed, page: 1 };
  }
  
  navigateTo(location.seed, location.page);
}

init();

