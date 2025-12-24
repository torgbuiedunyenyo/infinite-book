import { Reference } from './types';
import { marked } from 'marked';

// Configure marked for safe rendering
marked.setOptions({
  gfm: true,
  breaks: false,
});

const contentEl = document.getElementById('content')!;
const pageNumberEl = document.getElementById('page-number')!;

let currentReferences: Reference[] = [];

export function setPageNumber(num: number): void {
  pageNumberEl.textContent = `p. ${num}`;
}

export function clearContent(): void {
  contentEl.innerHTML = '';
  currentReferences = [];
}

export function setLoading(loading: boolean): void {
  contentEl.classList.toggle('loading', loading);
}

export function renderContent(content: string, references: Reference[]): void {
  currentReferences = references;
  contentEl.innerHTML = formatContent(content);
  attachReferenceHandlers();
}

export function appendChunk(fullText: string): void {
  const cursor = contentEl.querySelector('.streaming-cursor');
  if (cursor) {
    cursor.remove();
  }
  
  // Use the full accumulated text passed in, not textContent from DOM
  // (textContent loses paragraph breaks from <p> tags)
  contentEl.innerHTML = formatContentSimple(fullText);
  
  const cursorSpan = document.createElement('span');
  cursorSpan.className = 'streaming-cursor';
  contentEl.appendChild(cursorSpan);
}

export function finalizeStreaming(fullText: string, references: Reference[]): void {
  const cursor = contentEl.querySelector('.streaming-cursor');
  if (cursor) {
    cursor.remove();
  }
  
  // Use the full text passed in, not textContent from DOM
  // (textContent loses paragraph breaks from <p> tags)
  currentReferences = references;
  contentEl.innerHTML = formatContent(fullText);
  attachReferenceHandlers();
}

function formatContentSimple(text: string): string {
  // During streaming, use simple markdown parsing without reference links
  // This gives a preview while content is being generated
  return marked.parse(text) as string;
}

function formatContent(text: string): string {
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
  
  // Parse markdown
  let html = marked.parse(textWithPlaceholders) as string;
  
  // Replace placeholders with actual reference spans
  for (const { placeholder, refText } of refPlaceholders) {
    html = html.replace(
      placeholder,
      `<span class="reference" data-seed="${escapeAttr(refText)}">${escapeHtml(refText)}</span>`
    );
  }
  
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
  referenceClickHandler = handler;
}

function attachReferenceHandlers(): void {
  const refs = contentEl.querySelectorAll('.reference');
  refs.forEach(ref => {
    ref.addEventListener('click', (e) => {
      e.preventDefault();
      const seed = (ref as HTMLElement).dataset.seed;
      if (seed && referenceClickHandler) {
        referenceClickHandler(seed);
      }
    });
  });
}

