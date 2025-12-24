import { Page, Reference, GenerationContext, GetOrGenerateResult } from '../types';
import { getPage, getNeighborPages, savePage } from './database';
import { generatePageContent, streamPageContent } from './llm';

function extractOpening(content: string): string {
  const words = content.split(/\s+/);
  if (words.length <= 50) {
    return content;
  }
  
  const first60 = words.slice(0, 60).join(' ');
  const sentenceEnd = first60.search(/[.!?]\s/);
  
  if (sentenceEnd > 0 && sentenceEnd < first60.length - 10) {
    return first60.slice(0, sentenceEnd + 1);
  }
  
  return words.slice(0, 50).join(' ') + '...';
}

function extractClosing(content: string): string {
  const words = content.split(/\s+/);
  if (words.length <= 50) {
    return content;
  }
  
  const last60 = words.slice(-60).join(' ');
  const sentenceStart = last60.search(/[.!?]\s/);
  
  if (sentenceStart > 0) {
    return last60.slice(sentenceStart + 2);
  }
  
  return '...' + words.slice(-50).join(' ');
}

function extractReferences(content: string): Reference[] {
  const pattern = /\[\[([^\]]+)\]\]/g;
  const references: Reference[] = [];
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const text = match[1];
    if (!references.some((ref) => ref.text === text)) {
      references.push({
        text: text,
        seed: text,
      });
    }
  }

  return references;
}

export interface ReferrerContext {
  seed: string;
  pageNumber: number;
  content: string;
}

export async function getOrGeneratePage(
  seed: string,
  pageNumber: number,
  referrerContext?: ReferrerContext
): Promise<GetOrGenerateResult> {
  const existingPage = await getPage(seed, pageNumber);
  if (existingPage) {
    return { page: existingPage, isNewDiscovery: false };
  }

  const neighbors = await getNeighborPages(seed, pageNumber);

  const context: GenerationContext = {
    seed,
    pageNumber,
    prevPages: neighbors.prev,
    nextPages: neighbors.next,
    // Only include referrer context for page 1 when no neighboring pages exist
    referrerContext: pageNumber === 1 && neighbors.prev.length === 0 && neighbors.next.length === 0 ? referrerContext : undefined,
  };

  const content = await generatePageContent(context);

  const opening = extractOpening(content);
  const closing = extractClosing(content);
  const references = extractReferences(content);

  const newPage: Page = {
    seed,
    pageNumber,
    content,
    opening,
    closing,
    references,
  };

  const savedPage = await savePage(newPage);
  return { page: savedPage, isNewDiscovery: true };
}

export async function* streamOrGetPage(
  seed: string,
  pageNumber: number,
  referrerContext?: ReferrerContext
): AsyncGenerator<
  | { type: 'existing'; page: Page }
  | { type: 'chunk'; text: string }
  | { type: 'complete'; page: Page },
  void,
  unknown
> {
  const existingPage = await getPage(seed, pageNumber);
  if (existingPage) {
    yield { type: 'existing', page: existingPage };
    return;
  }

  const neighbors = await getNeighborPages(seed, pageNumber);

  const context: GenerationContext = {
    seed,
    pageNumber,
    prevPages: neighbors.prev,
    nextPages: neighbors.next,
    // Only include referrer context for page 1 when no neighboring pages exist
    referrerContext: pageNumber === 1 && neighbors.prev.length === 0 && neighbors.next.length === 0 ? referrerContext : undefined,
  };

  let fullContent = '';
  for await (const chunk of streamPageContent(context)) {
    fullContent += chunk;
    yield { type: 'chunk', text: chunk };
  }

  const opening = extractOpening(fullContent);
  const closing = extractClosing(fullContent);
  const references = extractReferences(fullContent);

  const newPage: Page = {
    seed,
    pageNumber,
    content: fullContent,
    opening,
    closing,
    references,
  };

  const savedPage = await savePage(newPage);
  yield { type: 'complete', page: savedPage };
}
