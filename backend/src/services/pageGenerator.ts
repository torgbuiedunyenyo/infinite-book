import { Page, Reference, GenerationContext, GetOrGenerateResult } from '../types';
import { getPage, getNeighborPages, savePage } from './database';
import { generatePageContent, streamPageContent } from './llm';
import { generatorLogger } from './logger';

const log = generatorLogger;

// Track generation statistics
let totalGenerations = 0;
let cacheHits = 0;
let cacheMisses = 0;
let streamGenerations = 0;
let nonStreamGenerations = 0;

function extractOpening(content: string): string {
  const words = content.split(/\s+/);
  
  log.debug('Extracting opening from content', {
    totalWords: words.length,
    contentLength: content.length,
  });
  
  if (words.length <= 50) {
    log.debug('Content short enough to use as-is for opening', {
      words: words.length,
    });
    return content;
  }
  
  const first60 = words.slice(0, 60).join(' ');
  const sentenceEnd = first60.search(/[.!?]\s/);
  
  let opening: string;
  if (sentenceEnd > 0 && sentenceEnd < first60.length - 10) {
    opening = first60.slice(0, sentenceEnd + 1);
    log.debug('Opening extracted at sentence boundary', {
      sentenceEndPosition: sentenceEnd,
      openingLength: opening.length,
    });
  } else {
    opening = words.slice(0, 50).join(' ') + '...';
    log.debug('Opening extracted at word boundary (no good sentence end found)', {
      openingLength: opening.length,
    });
  }
  
  return opening;
}

function extractClosing(content: string): string {
  const words = content.split(/\s+/);
  
  log.debug('Extracting closing from content', {
    totalWords: words.length,
    contentLength: content.length,
  });
  
  if (words.length <= 50) {
    log.debug('Content short enough to use as-is for closing', {
      words: words.length,
    });
    return content;
  }
  
  const last60 = words.slice(-60).join(' ');
  const sentenceStart = last60.search(/[.!?]\s/);
  
  let closing: string;
  if (sentenceStart > 0) {
    closing = last60.slice(sentenceStart + 2);
    log.debug('Closing extracted at sentence boundary', {
      sentenceStartPosition: sentenceStart,
      closingLength: closing.length,
    });
  } else {
    closing = '...' + words.slice(-50).join(' ');
    log.debug('Closing extracted at word boundary (no good sentence start found)', {
      closingLength: closing.length,
    });
  }
  
  return closing;
}

function extractReferences(content: string): Reference[] {
  const pattern = /\[\[([^\]]+)\]\]/g;
  const references: Reference[] = [];
  let match;
  
  log.debug('Extracting references from content', {
    contentLength: content.length,
  });

  while ((match = pattern.exec(content)) !== null) {
    const text = match[1];
    if (!references.some((ref) => ref.text === text)) {
      references.push({
        text: text,
        seed: text,
      });
      log.debug('Reference found', {
        text,
        position: match.index,
        referenceNumber: references.length,
      });
    } else {
      log.debug('Duplicate reference skipped', {
        text,
        position: match.index,
      });
    }
  }
  
  log.info('References extraction complete', {
    totalReferences: references.length,
    uniqueReferences: references.map(r => r.text),
  });

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
  const genId = ++totalGenerations;
  
  log.separator(`PAGE REQUEST #${genId}: "${seed}" p.${pageNumber}`);
  
  log.info(`Request #${genId}: getOrGeneratePage called`, {
    seed,
    pageNumber,
    hasReferrerContext: !!referrerContext,
    referrerSeed: referrerContext?.seed,
    referrerPage: referrerContext?.pageNumber,
  });
  
  // Check if page already exists
  log.debug(`Request #${genId}: Checking for existing page in database`);
  const existingPage = await getPage(seed, pageNumber);
  
  if (existingPage) {
    cacheHits++;
    log.info(`Request #${genId}: PAGE FOUND IN DATABASE (cache hit)`, {
      id: existingPage.id,
      seed: existingPage.seed,
      pageNumber: existingPage.pageNumber,
      contentLength: existingPage.content.length,
      referencesCount: existingPage.references.length,
      discoveredAt: existingPage.discoveredAt,
      cacheHitRate: `${((cacheHits / totalGenerations) * 100).toFixed(1)}%`,
    });
    return { page: existingPage, isNewDiscovery: false };
  }
  
  cacheMisses++;
  nonStreamGenerations++;
  
  log.info(`Request #${genId}: PAGE NOT FOUND - Beginning generation (cache miss)`, {
    seed,
    pageNumber,
    cacheMissRate: `${((cacheMisses / totalGenerations) * 100).toFixed(1)}%`,
  });
  
  // Fetch neighboring pages for context
  log.debug(`Request #${genId}: Fetching neighbor pages for continuity`);
  const neighbors = await getNeighborPages(seed, pageNumber);
  
  log.info(`Request #${genId}: Neighbor context assembled`, {
    prevPages: neighbors.prev.map(p => ({
      pageNumber: p.pageNumber,
      contentLength: p.content.length,
    })),
    nextPages: neighbors.next.map(p => ({
      pageNumber: p.pageNumber,
      contentLength: p.content.length,
    })),
  });

  // Build generation context
  const context: GenerationContext = {
    seed,
    pageNumber,
    prevPages: neighbors.prev,
    nextPages: neighbors.next,
    // Only include referrer context for page 1 when no neighboring pages exist
    referrerContext: pageNumber === 1 && neighbors.prev.length === 0 && neighbors.next.length === 0 ? referrerContext : undefined,
  };
  
  log.debug(`Request #${genId}: Generation context prepared`, {
    seed: context.seed,
    pageNumber: context.pageNumber,
    prevPagesCount: context.prevPages.length,
    nextPagesCount: context.nextPages.length,
    includesReferrerContext: !!context.referrerContext,
  });

  // Generate content via LLM
  log.info(`Request #${genId}: Calling LLM for content generation`);
  const startTime = performance.now();
  const content = await generatePageContent(context);
  const generationTime = performance.now() - startTime;
  
  log.info(`Request #${genId}: LLM generation complete`, {
    generationTime: `${generationTime.toFixed(2)}ms`,
    contentLength: content.length,
    wordCount: content.split(/\s+/).length,
  });

  // Extract metadata
  log.debug(`Request #${genId}: Extracting metadata from generated content`);
  const opening = extractOpening(content);
  const closing = extractClosing(content);
  const references = extractReferences(content);

  // Build page object
  const newPage: Page = {
    seed,
    pageNumber,
    content,
    opening,
    closing,
    references,
  };
  
  log.debug(`Request #${genId}: Page object constructed`, {
    seed: newPage.seed,
    pageNumber: newPage.pageNumber,
    contentLength: newPage.content.length,
    openingLength: newPage.opening.length,
    closingLength: newPage.closing.length,
    referencesCount: newPage.references.length,
  });

  // Save to database
  log.info(`Request #${genId}: Saving new page to database`);
  const savedPage = await savePage(newPage);
  
  log.info(`Request #${genId}: NEW PAGE DISCOVERED AND SAVED`, {
    id: savedPage.id,
    seed: savedPage.seed,
    pageNumber: savedPage.pageNumber,
    discoveredAt: savedPage.discoveredAt,
    totalGenerationTime: `${generationTime.toFixed(2)}ms`,
    references: savedPage.references.map(r => r.text),
  });
  
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
  const genId = ++totalGenerations;
  
  log.separator(`STREAMING PAGE REQUEST #${genId}: "${seed}" p.${pageNumber}`);
  
  log.info(`Stream #${genId}: streamOrGetPage called`, {
    seed,
    pageNumber,
    hasReferrerContext: !!referrerContext,
    referrerSeed: referrerContext?.seed,
    referrerPage: referrerContext?.pageNumber,
  });
  
  // Check if page already exists
  log.debug(`Stream #${genId}: Checking for existing page in database`);
  const existingPage = await getPage(seed, pageNumber);
  
  if (existingPage) {
    cacheHits++;
    log.info(`Stream #${genId}: PAGE FOUND IN DATABASE (cache hit) - returning immediately`, {
      id: existingPage.id,
      contentLength: existingPage.content.length,
      referencesCount: existingPage.references.length,
      discoveredAt: existingPage.discoveredAt,
      cacheHitRate: `${((cacheHits / totalGenerations) * 100).toFixed(1)}%`,
    });
    yield { type: 'existing', page: existingPage };
    return;
  }
  
  cacheMisses++;
  streamGenerations++;
  
  log.info(`Stream #${genId}: PAGE NOT FOUND - Beginning streaming generation (cache miss)`, {
    seed,
    pageNumber,
    streamGenerations,
    cacheMissRate: `${((cacheMisses / totalGenerations) * 100).toFixed(1)}%`,
  });

  // Fetch neighboring pages for context
  log.debug(`Stream #${genId}: Fetching neighbor pages for continuity`);
  const neighbors = await getNeighborPages(seed, pageNumber);
  
  log.info(`Stream #${genId}: Neighbor context assembled`, {
    prevPages: neighbors.prev.map(p => ({
      pageNumber: p.pageNumber,
      openingPreview: p.opening.slice(0, 50) + '...',
    })),
    nextPages: neighbors.next.map(p => ({
      pageNumber: p.pageNumber,
      openingPreview: p.opening.slice(0, 50) + '...',
    })),
  });

  // Build generation context
  const context: GenerationContext = {
    seed,
    pageNumber,
    prevPages: neighbors.prev,
    nextPages: neighbors.next,
    // Only include referrer context for page 1 when no neighboring pages exist
    referrerContext: pageNumber === 1 && neighbors.prev.length === 0 && neighbors.next.length === 0 ? referrerContext : undefined,
  };
  
  log.debug(`Stream #${genId}: Generation context prepared for streaming`, {
    includesReferrerContext: !!context.referrerContext,
    contextSummary: {
      prevPages: context.prevPages.length,
      nextPages: context.nextPages.length,
    },
  });

  // Stream content from LLM
  log.info(`Stream #${genId}: Starting LLM stream`);
  const startTime = performance.now();
  let fullContent = '';
  let chunkCount = 0;
  
  for await (const chunk of streamPageContent(context)) {
    fullContent += chunk;
    chunkCount++;
    
    // Log every 20th chunk
    if (chunkCount % 20 === 0) {
      log.debug(`Stream #${genId}: Streaming progress`, {
        chunkCount,
        totalChars: fullContent.length,
        elapsedTime: `${(performance.now() - startTime).toFixed(2)}ms`,
      });
    }
    
    yield { type: 'chunk', text: chunk };
  }
  
  const streamTime = performance.now() - startTime;
  
  log.info(`Stream #${genId}: LLM stream complete`, {
    streamTime: `${streamTime.toFixed(2)}ms`,
    totalChunks: chunkCount,
    contentLength: fullContent.length,
    wordCount: fullContent.split(/\s+/).length,
  });

  // Extract metadata
  log.debug(`Stream #${genId}: Extracting metadata from streamed content`);
  const opening = extractOpening(fullContent);
  const closing = extractClosing(fullContent);
  const references = extractReferences(fullContent);

  // Build page object
  const newPage: Page = {
    seed,
    pageNumber,
    content: fullContent,
    opening,
    closing,
    references,
  };
  
  log.debug(`Stream #${genId}: Page object constructed from stream`, {
    contentLength: newPage.content.length,
    openingLength: newPage.opening.length,
    closingLength: newPage.closing.length,
    referencesCount: newPage.references.length,
  });

  // Save to database
  log.info(`Stream #${genId}: Saving streamed page to database`);
  const savedPage = await savePage(newPage);
  
  log.info(`Stream #${genId}: NEW PAGE DISCOVERED AND SAVED (via stream)`, {
    id: savedPage.id,
    seed: savedPage.seed,
    pageNumber: savedPage.pageNumber,
    discoveredAt: savedPage.discoveredAt,
    totalStreamTime: `${streamTime.toFixed(2)}ms`,
    references: savedPage.references.map(r => r.text),
  });
  
  yield { type: 'complete', page: savedPage };
}

// Export generation stats for monitoring
export function getGeneratorStats() {
  return {
    totalGenerations,
    cacheHits,
    cacheMisses,
    cacheHitRate: totalGenerations > 0 ? `${((cacheHits / totalGenerations) * 100).toFixed(1)}%` : '0%',
    streamGenerations,
    nonStreamGenerations,
  };
}
