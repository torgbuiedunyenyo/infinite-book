import { Reference } from './types';
import { marked } from 'marked';
import { rendererLogger } from './logger';

const log = rendererLogger;

// Configure marked for safe rendering
marked.setOptions({
  gfm: true,
  breaks: false,
});

log.debug('Marked configured', {
  gfm: true,
  breaks: false,
});

const contentEl = document.getElementById('content')!;
const pageNumberEl = document.getElementById('page-number')!;

log.debug('DOM elements captured', {
  contentEl: !!contentEl,
  pageNumberEl: !!pageNumberEl,
});

let currentReferences: Reference[] = [];

// Stats
let totalRenders = 0;
let totalChunks = 0;
let totalFinalizations = 0;
let referenceClickCount = 0;

export function setPageNumber(num: number): void {
  log.debug('Setting page number', { pageNumber: num });
  pageNumberEl.textContent = `p. ${num}`;
}

export function clearContent(): void {
  log.debug('Clearing content', {
    previousContentLength: contentEl.innerHTML.length,
    previousReferencesCount: currentReferences.length,
  });
  
  contentEl.innerHTML = '';
  currentReferences = [];
}

export function setLoading(loading: boolean): void {
  log.debug('Setting loading state', { loading });
  contentEl.classList.toggle('loading', loading);
}

export function renderContent(content: string, references: Reference[]): void {
  totalRenders++;
  
  log.info('renderContent called', {
    contentLength: content.length,
    referencesCount: references.length,
    totalRenders,
  });
  
  currentReferences = references;
  
  const startTime = performance.now();
  const formattedContent = formatContent(content);
  const formatDuration = performance.now() - startTime;
  
  log.debug('Content formatted', {
    inputLength: content.length,
    outputLength: formattedContent.length,
    formatDuration: `${formatDuration.toFixed(2)}ms`,
  });
  
  contentEl.innerHTML = formattedContent;
  attachReferenceHandlers();
  
  log.debug('Content rendered and handlers attached', {
    elementsCreated: contentEl.children.length,
    referencesLinked: contentEl.querySelectorAll('.reference').length,
  });
}

export function appendChunk(fullText: string): void {
  totalChunks++;
  
  // Remove existing cursor
  const cursor = contentEl.querySelector('.streaming-cursor');
  if (cursor) {
    cursor.remove();
  }
  
  // Log every 25th chunk to avoid spam
  if (totalChunks % 25 === 0) {
    log.debug('Streaming chunk appended', {
      totalChunks,
      contentLength: fullText.length,
    });
  }
  
  // Use the full accumulated text passed in, not textContent from DOM
  // (textContent loses paragraph breaks from <p> tags)
  contentEl.innerHTML = formatContentSimple(fullText);
  
  // Add cursor
  const cursorSpan = document.createElement('span');
  cursorSpan.className = 'streaming-cursor';
  contentEl.appendChild(cursorSpan);
}

export function finalizeStreaming(fullText: string, references: Reference[]): void {
  totalFinalizations++;
  
  log.info('finalizeStreaming called', {
    contentLength: fullText.length,
    referencesCount: references.length,
    totalFinalizations,
    totalChunksReceived: totalChunks,
  });
  
  // Remove cursor
  const cursor = contentEl.querySelector('.streaming-cursor');
  if (cursor) {
    cursor.remove();
    log.debug('Streaming cursor removed');
  }
  
  // Use the full text passed in, not textContent from DOM
  // (textContent loses paragraph breaks from <p> tags)
  currentReferences = references;
  
  const startTime = performance.now();
  const formattedContent = formatContent(fullText);
  const formatDuration = performance.now() - startTime;
  
  log.debug('Streamed content formatted', {
    inputLength: fullText.length,
    outputLength: formattedContent.length,
    formatDuration: `${formatDuration.toFixed(2)}ms`,
  });
  
  contentEl.innerHTML = formattedContent;
  attachReferenceHandlers();
  
  log.info('Streaming finalized', {
    elementsCreated: contentEl.children.length,
    referencesLinked: contentEl.querySelectorAll('.reference').length,
    references: references.map(r => r.text),
  });
  
  // Reset chunk counter for next stream
  totalChunks = 0;
}

function formatContentSimple(text: string): string {
  // During streaming, use simple markdown parsing without reference links
  // This gives a preview while content is being generated
  return marked.parse(text) as string;
}

function formatContent(text: string): string {
  log.debug('formatContent called', {
    inputLength: text.length,
    wordCount: text.split(/\s+/).length,
  });
  
  // First convert [[references]] to a placeholder that won't be affected by markdown
  // Use a unique marker without special markdown characters (no underscores, asterisks, etc.)
  const refPlaceholders: { placeholder: string; refText: string }[] = [];
  let placeholderIndex = 0;
  
  const textWithPlaceholders = text.replace(/\[\[([^\]]+)\]\]/g, (match, refText) => {
    const placeholder = `XREFX${placeholderIndex}XENDX`;
    refPlaceholders.push({ placeholder, refText });
    placeholderIndex++;
    return placeholder;
  });
  
  log.debug('References converted to placeholders', {
    referencesFound: refPlaceholders.length,
    references: refPlaceholders.map(p => p.refText),
  });
  
  // Parse markdown
  let html = marked.parse(textWithPlaceholders) as string;
  
  log.debug('Markdown parsed', {
    htmlLength: html.length,
  });
  
  // Replace placeholders with actual reference spans
  for (const { placeholder, refText } of refPlaceholders) {
    html = html.replace(
      placeholder,
      `<span class="reference" data-seed="${escapeAttr(refText)}">${escapeHtml(refText)}</span>`
    );
  }
  
  log.debug('Placeholders replaced with reference spans', {
    finalHtmlLength: html.length,
  });
  
  return html;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let referenceClickHandler: ((seed: string) => void) | null = null;

export function onReferenceClick(handler: (seed: string) => void): void {
  log.debug('Reference click handler registered');
  referenceClickHandler = handler;
}

function attachReferenceHandlers(): void {
  const refs = contentEl.querySelectorAll('.reference');
  
  log.debug('Attaching reference handlers', {
    referenceCount: refs.length,
  });
  
  refs.forEach((ref, index) => {
    ref.addEventListener('click', (e) => {
      e.preventDefault();
      const seed = (ref as HTMLElement).dataset.seed;
      
      referenceClickCount++;
      
      log.info('Reference clicked', {
        seed,
        referenceIndex: index,
        totalReferenceClicks: referenceClickCount,
      });
      
      if (seed && referenceClickHandler) {
        referenceClickHandler(seed);
      } else {
        log.warn('Reference click not handled', {
          hasSeed: !!seed,
          hasHandler: !!referenceClickHandler,
        });
      }
    });
  });
  
  log.debug('Reference handlers attached', {
    handlersAttached: refs.length,
  });
}

// Export renderer stats
export function getRendererStats() {
  return {
    totalRenders,
    totalChunks,
    totalFinalizations,
    referenceClickCount,
    currentReferencesCount: currentReferences.length,
    contentLength: contentEl.innerHTML.length,
    visibleReferences: contentEl.querySelectorAll('.reference').length,
  };
}
