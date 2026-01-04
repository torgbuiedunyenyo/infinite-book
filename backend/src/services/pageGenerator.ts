import { Page, Reference, GenerationContext, GetOrGenerateResult, SequentialAccessError, InvalidSeedAccessError, normalizeSeed } from '../types';
import { getPage, getPreviousPages, savePage, getBookArc, getChunkSummaries, saveBookArc, getRunningSummary } from './database';
import { generatePageContent, streamPageContentWithTrace, GenerationMetadata } from './llm';
import { getRelevantFactsForGeneration, scheduleFactExtraction } from './factsService';
import { 
  getContextForGeneration, 
  scheduleArcGeneration, 
  scheduleChunkAndMomentum, 
  generateBookArc,
  ensureChunkSummaryExists,
  ensureRunningSummaryUpdated,
} from './summaryService';
import { scheduleEvaluation } from './evaluationService';
import { buildPrompt, CORE_NARRATIVE_SEED, getSystemPrompt } from '../prompts/templates';
import { generatorLogger } from './logger';

// ==================== CONTEXT REQUIREMENTS ====================
// Strong guarantees: no timeouts, retry until success
const CONTEXT_POLL_INTERVAL = 2000; // Check every 2 seconds (for initial background task completion)
const INITIAL_WAIT_MS = 30000;      // Wait 30s for background tasks before taking over

// ==================== COMPLETE PROMPT BUILDER ====================
/**
 * Build the complete prompt that was sent to Claude, including both system and user prompts.
 * This is stored in the database for complete reproducibility.
 */
function buildCompletePrompt(userPrompt: string, isCoreSeed: boolean): string {
  const systemPrompt = getSystemPrompt(isCoreSeed);
  
  return `=== SYSTEM PROMPT ===

${systemPrompt}

=== USER PROMPT ===

${userPrompt}`;
}
const ARC_GENERATION_MAX_RETRIES = 5; // Max attempts to generate book arc

const log = generatorLogger;

// Track generation statistics
let totalGenerations = 0;
let cacheHits = 0;
let cacheMisses = 0;
let streamGenerations = 0;
let nonStreamGenerations = 0;
let inProgressHits = 0;  // Times we avoided duplicate generation by waiting for in-progress

// Track generations currently in progress to prevent duplicate work
// Maps "seed::pageNumber" to a Promise that resolves with the generated page
const generationsInProgress = new Map<string, Promise<Page>>();

function pageKey(seed: string, pageNumber: number): string {
  return `${seed}::${pageNumber}`;
}

/**
 * Ensure all required narrative context exists before proceeding with generation.
 * STRONG GUARANTEES: No timeouts. Retries until success or throws.
 * 
 * This prevents narrative drift by ensuring:
 * - Pages 2+ have the book arc (generated from page 1)
 * - Pages 6+ have the most recent chunk summary AND running summary
 * 
 * If context doesn't exist after initial wait for background tasks,
 * actively generates it with retries. Will NOT proceed without context.
 */
async function waitForRequiredContext(
  seed: string,
  pageNumber: number
): Promise<void> {
  const startTime = Date.now();

  // ==================== BOOK ARC (pages 2+) ====================
  if (pageNumber > 1) {
    let bookArc = await getBookArc(seed);
    
    // First, wait briefly for background task to complete
    const waitStart = Date.now();
    while (!bookArc && (Date.now() - waitStart) < INITIAL_WAIT_MS) {
      log.debug('Waiting for book arc (background task)', {
        seed,
        pageNumber,
        elapsed: `${Date.now() - waitStart}ms`,
      });
      
      await new Promise(resolve => setTimeout(resolve, CONTEXT_POLL_INTERVAL));
      bookArc = await getBookArc(seed);
    }
    
    // If still no arc, actively generate it with retries
    if (!bookArc) {
      log.warn('Book arc not found - generating with retries', {
        seed,
        pageNumber,
        waitedMs: Date.now() - waitStart,
      });
      
      const page1 = await getPage(seed, 1);
      if (!page1) {
        throw new Error(`Cannot generate book arc - page 1 not found for "${seed}"`);
      }
      
      for (let attempt = 1; attempt <= ARC_GENERATION_MAX_RETRIES; attempt++) {
        log.info(`Book arc generation attempt ${attempt}/${ARC_GENERATION_MAX_RETRIES}`, {
          seed,
          pageNumber,
        });
        
        try {
          const arc = await generateBookArc(seed, page1.content);
          if (arc) {
            await saveBookArc(arc);
            log.info('Book arc generated and saved', { seed, attempt });
            bookArc = arc;
            break;
          }
          log.warn(`Book arc generation returned null (attempt ${attempt})`, { seed });
        } catch (error) {
          log.error(`Book arc generation failed (attempt ${attempt})`, {
            seed,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        
        if (attempt < ARC_GENERATION_MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
      if (!bookArc) {
        throw new Error(
          `Failed to obtain book arc for "${seed}" after ${ARC_GENERATION_MAX_RETRIES} attempts. ` +
          `Cannot generate page ${pageNumber} without narrative guidance.`
        );
      }
    }
    
    log.debug('Book arc confirmed available', { seed, pageNumber });
  }

  // ==================== CHUNK & RUNNING SUMMARY (pages 6+) ====================
  if (pageNumber > 5) {
    // Calculate the most recent completed chunk
    // Page 6-10 needs chunk 1-5 (end=5), page 11-15 needs chunk 6-10 (end=10), etc.
    const requiredChunkEnd = Math.floor((pageNumber - 1) / 5) * 5;
    
    if (requiredChunkEnd >= 5) {
      const requiredChunkStart = requiredChunkEnd - 4;
      
      // First, wait briefly for background task to complete
      let chunks = await getChunkSummaries(seed, pageNumber);
      let hasRequiredChunk = chunks.some(c => c.chunkEnd === requiredChunkEnd);
      
      const waitStart = Date.now();
      while (!hasRequiredChunk && (Date.now() - waitStart) < INITIAL_WAIT_MS) {
        log.debug('Waiting for chunk summary (background task)', {
          seed,
          pageNumber,
          requiredChunkEnd,
          elapsed: `${Date.now() - waitStart}ms`,
        });
        
        await new Promise(resolve => setTimeout(resolve, CONTEXT_POLL_INTERVAL));
        chunks = await getChunkSummaries(seed, pageNumber);
        hasRequiredChunk = chunks.some(c => c.chunkEnd === requiredChunkEnd);
      }
      
      // If still no chunk, actively generate it with retries (will throw on failure)
      if (!hasRequiredChunk) {
        log.warn('Chunk summary not found - generating with retries', {
          seed,
          pageNumber,
          requiredChunkStart,
          requiredChunkEnd,
          waitedMs: Date.now() - waitStart,
        });
        
        await ensureChunkSummaryExists(seed, requiredChunkStart, requiredChunkEnd);
      }
      
      log.debug('Chunk summary confirmed available', { seed, pageNumber, requiredChunkEnd });
      
      // Now ensure running summary is up-to-date for this chunk boundary
      // Running summary should be updated at the same page as chunk boundary
      const runningSummary = await getRunningSummary(seed);
      
      if (!runningSummary || runningSummary.lastUpdatedPage < requiredChunkEnd) {
        log.warn('Running summary stale or missing - generating with retries', {
          seed,
          pageNumber,
          requiredPage: requiredChunkEnd,
          currentPage: runningSummary?.lastUpdatedPage ?? 'none',
        });
        
        await ensureRunningSummaryUpdated(seed, requiredChunkEnd);
      }
      
      log.debug('Running summary confirmed up-to-date', { seed, pageNumber, requiredChunkEnd });
    }
  }
  
  const totalTime = Date.now() - startTime;
  log.info('All required context confirmed', {
    seed,
    pageNumber,
    totalTimeMs: totalTime,
  });
}

/**
 * Generator version of waitForRequiredContext that yields waiting events.
 * Used by streaming endpoint to inform the frontend of delays.
 * STRONG GUARANTEES: No timeouts. Retries until success or throws.
 */
async function* waitForRequiredContextWithEvents(
  seed: string,
  pageNumber: number
): AsyncGenerator<{ type: 'waiting'; message: string }, void, unknown> {
  const startTime = Date.now();
  let yieldedWaiting = false;

  // ==================== BOOK ARC (pages 2+) ====================
  if (pageNumber > 1) {
    let bookArc = await getBookArc(seed);
    
    // First, wait briefly for background task to complete
    const waitStart = Date.now();
    while (!bookArc && (Date.now() - waitStart) < INITIAL_WAIT_MS) {
      if (!yieldedWaiting) {
        log.info('Yielding waiting event for book arc', { seed, pageNumber });
        yield { type: 'waiting', message: 'Preparing narrative context...' };
        yieldedWaiting = true;
      }
      
      log.debug('Waiting for book arc (streaming)', {
        seed,
        pageNumber,
        elapsed: `${Date.now() - waitStart}ms`,
      });
      
      await new Promise(resolve => setTimeout(resolve, CONTEXT_POLL_INTERVAL));
      bookArc = await getBookArc(seed);
    }
    
    // If still no arc, actively generate it with retries
    if (!bookArc) {
      log.warn('Book arc not found - generating with retries (streaming)', {
        seed,
        pageNumber,
        waitedMs: Date.now() - waitStart,
      });
      
      if (!yieldedWaiting) {
        yield { type: 'waiting', message: 'Generating narrative context...' };
        yieldedWaiting = true;
      }
      
      const page1 = await getPage(seed, 1);
      if (!page1) {
        throw new Error(`Cannot generate book arc - page 1 not found for "${seed}"`);
      }
      
      for (let attempt = 1; attempt <= ARC_GENERATION_MAX_RETRIES; attempt++) {
        log.info(`Book arc generation attempt ${attempt}/${ARC_GENERATION_MAX_RETRIES} (streaming)`, {
          seed,
          pageNumber,
        });
        
        try {
          const arc = await generateBookArc(seed, page1.content);
          if (arc) {
            await saveBookArc(arc);
            log.info('Book arc generated and saved (streaming)', { seed, attempt });
            bookArc = arc;
            break;
          }
          log.warn(`Book arc generation returned null (streaming, attempt ${attempt})`, { seed });
        } catch (error) {
          log.error(`Book arc generation failed (streaming, attempt ${attempt})`, {
            seed,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        
        if (attempt < ARC_GENERATION_MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
      if (!bookArc) {
        throw new Error(
          `Failed to obtain book arc for "${seed}" after ${ARC_GENERATION_MAX_RETRIES} attempts. ` +
          `Cannot generate page ${pageNumber} without narrative guidance.`
        );
      }
    }
  }

  // ==================== CHUNK & RUNNING SUMMARY (pages 6+) ====================
  if (pageNumber > 5) {
    const requiredChunkEnd = Math.floor((pageNumber - 1) / 5) * 5;
    
    if (requiredChunkEnd >= 5) {
      const requiredChunkStart = requiredChunkEnd - 4;
      
      // First, wait briefly for background task to complete
      let chunks = await getChunkSummaries(seed, pageNumber);
      let hasRequiredChunk = chunks.some(c => c.chunkEnd === requiredChunkEnd);
      
      const waitStart = Date.now();
      while (!hasRequiredChunk && (Date.now() - waitStart) < INITIAL_WAIT_MS) {
        if (!yieldedWaiting) {
          log.info('Yielding waiting event for chunk summary', { seed, pageNumber, requiredChunkEnd });
          yield { type: 'waiting', message: 'Preparing chapter summary...' };
          yieldedWaiting = true;
        }
        
        log.debug('Waiting for chunk summary (streaming)', {
          seed,
          pageNumber,
          requiredChunkEnd,
          elapsed: `${Date.now() - waitStart}ms`,
        });
        
        await new Promise(resolve => setTimeout(resolve, CONTEXT_POLL_INTERVAL));
        chunks = await getChunkSummaries(seed, pageNumber);
        hasRequiredChunk = chunks.some(c => c.chunkEnd === requiredChunkEnd);
      }
      
      // If still no chunk, actively generate it with retries (will throw on failure)
      if (!hasRequiredChunk) {
        log.warn('Chunk summary not found - generating with retries (streaming)', {
          seed,
          pageNumber,
          requiredChunkStart,
          requiredChunkEnd,
          waitedMs: Date.now() - waitStart,
        });
        
        if (!yieldedWaiting) {
          yield { type: 'waiting', message: 'Generating chapter summary...' };
          yieldedWaiting = true;
        }
        
        await ensureChunkSummaryExists(seed, requiredChunkStart, requiredChunkEnd);
      }
      
      log.debug('Chunk summary confirmed available (streaming)', { seed, pageNumber, requiredChunkEnd });
      
      // Now ensure running summary is up-to-date
      const runningSummary = await getRunningSummary(seed);
      
      if (!runningSummary || runningSummary.lastUpdatedPage < requiredChunkEnd) {
        log.warn('Running summary stale or missing - generating with retries (streaming)', {
          seed,
          pageNumber,
          requiredPage: requiredChunkEnd,
          currentPage: runningSummary?.lastUpdatedPage ?? 'none',
        });
        
        if (!yieldedWaiting) {
          yield { type: 'waiting', message: 'Updating story momentum...' };
          yieldedWaiting = true;
        }
        
        await ensureRunningSummaryUpdated(seed, requiredChunkEnd);
      }
      
      log.debug('Running summary confirmed up-to-date (streaming)', { seed, pageNumber, requiredChunkEnd });
    }
  }
  
  const totalTime = Date.now() - startTime;
  log.info('All required context confirmed (streaming)', {
    seed,
    pageNumber,
    totalTimeMs: totalTime,
  });
}

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
  
  // Take first 60 words and find a good sentence boundary
  const first60 = words.slice(0, 60).join(' ');
  
  // Look for sentence end that's not too early (at least 30 chars in)
  // This fixes the bug where only 4-5 words were captured
  let sentenceEnd = -1;
  const minPosition = 100; // Require at least 100 chars before cutting
  
  for (let i = minPosition; i < first60.length - 10; i++) {
    if (first60[i] === '.' || first60[i] === '!' || first60[i] === '?') {
      if (i + 1 < first60.length && first60[i + 1] === ' ') {
        sentenceEnd = i;
        break;
      }
    }
  }
  
  let opening: string;
  if (sentenceEnd > 0) {
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
    // Normalize the seed to Title Case for consistent book naming
    const normalizedSeed = normalizeSeed(text);
    
    // Check for duplicates using normalized seed (case-insensitive dedup)
    if (!references.some((ref) => ref.seed === normalizedSeed)) {
      references.push({
        text: text,           // Preserve original text for display
        seed: normalizedSeed, // Use normalized seed for database lookup
      });
      log.debug('Reference found', {
        text,
        normalizedSeed,
        position: match.index,
        referenceNumber: references.length,
      });
    } else {
      log.debug('Duplicate reference skipped', {
        text,
        normalizedSeed,
        position: match.index,
      });
    }
  }
  
  log.info('References extraction complete', {
    totalReferences: references.length,
    uniqueReferences: references.map(r => ({ text: r.text, seed: r.seed })),
  });

  return references;
}

export interface ReferrerContext {
  seed: string;
  pageNumber: number;
  content: string;
  references: Reference[];  // The references from the referrer page
  // Enhanced fields for inset narrative context
  isCoreSeed?: boolean;
  parentBookArc?: string;
}

/**
 * Validates that a page can be generated based on access control rules:
 * 1. Page N (N > 1) requires page N-1 to exist
 * 2. Page 1 of a non-canonical seed requires valid referrer context
 * 
 * Throws SequentialAccessError or InvalidSeedAccessError if validation fails.
 */
async function validateGenerationAccess(
  seed: string,
  pageNumber: number,
  referrerContext: ReferrerContext | undefined,
  isCanonicalSeed: boolean
): Promise<void> {
  // Rule 1: For page N > 1, page N-1 must exist
  if (pageNumber > 1) {
    const previousPage = await getPage(seed, pageNumber - 1);
    if (!previousPage) {
      log.warn('Sequential access violation', {
        seed,
        requestedPage: pageNumber,
        requiredPage: pageNumber - 1,
      });
      throw new SequentialAccessError(seed, pageNumber);
    }
    log.debug('Sequential access validated', {
      seed,
      pageNumber,
      previousPageExists: true,
    });
  }

  // Rule 2: For page 1 of a non-canonical seed, require valid referrer
  if (pageNumber === 1 && !isCanonicalSeed) {
    // Check if any page exists for this seed already
    const existingPage1 = await getPage(seed, 1);
    if (!existingPage1) {
      // This would create a NEW book - validate referrer
      if (!referrerContext) {
        log.warn('Invalid seed access: no referrer context', { seed });
        throw new InvalidSeedAccessError(seed, 'New books can only be created by following references from existing pages');
      }

      // Verify the referrer page contains this seed as a reference
      const hasReference = referrerContext.references.some(
        ref => ref.seed.toLowerCase() === seed.toLowerCase()
      );
      if (!hasReference) {
        log.warn('Invalid seed access: referrer does not contain reference', {
          seed,
          referrerSeed: referrerContext.seed,
          referrerPage: referrerContext.pageNumber,
          referrerReferences: referrerContext.references.map(r => r.seed),
        });
        throw new InvalidSeedAccessError(seed, 'The referrer page does not contain a reference to this book');
      }

      log.debug('New seed access validated via referrer', {
        seed,
        referrerSeed: referrerContext.seed,
        referrerPage: referrerContext.pageNumber,
      });
    }
  }
}

export async function getOrGeneratePage(
  seed: string,
  pageNumber: number,
  referrerContext?: ReferrerContext,
  isCanonicalSeed: boolean = false
): Promise<GetOrGenerateResult> {
  const genId = ++totalGenerations;
  const key = pageKey(seed, pageNumber);
  
  log.separator(`PAGE REQUEST #${genId}: "${seed}" p.${pageNumber}`);
  
  log.info(`Request #${genId}: getOrGeneratePage called`, {
    seed,
    pageNumber,
    hasReferrerContext: !!referrerContext,
    referrerSeed: referrerContext?.seed,
    referrerPage: referrerContext?.pageNumber,
    isCanonicalSeed,
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
  
  // Check if generation is already in progress (prevents duplicate work)
  const inProgressPromise = generationsInProgress.get(key);
  if (inProgressPromise) {
    inProgressHits++;
    log.info(`Request #${genId}: GENERATION ALREADY IN PROGRESS - waiting for existing generation`, {
      seed,
      pageNumber,
      key,
      inProgressHits,
      inProgressCount: generationsInProgress.size,
    });
    
    // Wait for the in-progress generation to complete
    const page = await inProgressPromise;
    log.info(`Request #${genId}: In-progress generation completed, returning result`, {
      seed,
      pageNumber,
      contentLength: page.content.length,
    });
    return { page, isNewDiscovery: false };
  }
  
  // ACCESS CONTROL: Validate that this page can be generated
  log.debug(`Request #${genId}: Validating generation access`);
  await validateGenerationAccess(seed, pageNumber, referrerContext, isCanonicalSeed);
  
  cacheMisses++;
  nonStreamGenerations++;
  
  log.info(`Request #${genId}: PAGE NOT FOUND - Beginning generation (cache miss)`, {
    seed,
    pageNumber,
    cacheMissRate: `${((cacheMisses / totalGenerations) * 100).toFixed(1)}%`,
  });
  
  // Create a promise for this generation and register it
  const generationPromise = doGeneratePage(genId, seed, pageNumber, referrerContext);
  generationsInProgress.set(key, generationPromise);
  
  log.debug(`Request #${genId}: Registered generation in progress`, {
    key,
    inProgressCount: generationsInProgress.size,
  });
  
  try {
    const page = await generationPromise;
    return { page, isNewDiscovery: true };
  } finally {
    // Always clean up the in-progress registry
    generationsInProgress.delete(key);
    log.debug(`Request #${genId}: Removed from in-progress registry`, {
      key,
      inProgressCount: generationsInProgress.size,
    });
  }
}

// Internal function that does the actual generation work
async function doGeneratePage(
  genId: number,
  seed: string,
  pageNumber: number,
  referrerContext?: ReferrerContext
): Promise<Page> {
  
  // Wait for required context to be ready (book arc for pages 2+, chunk summaries for pages 6+)
  log.debug(`Request #${genId}: Checking required context availability`);
  await waitForRequiredContext(seed, pageNumber);
  
  // Fetch previous pages for context (now 3 pages instead of 2)
  log.debug(`Request #${genId}: Fetching previous pages for continuity`);
  const prevPages = await getPreviousPages(seed, pageNumber);
  
  log.info(`Request #${genId}: Previous pages context assembled`, {
    prevPages: prevPages.map(p => ({
      pageNumber: p.pageNumber,
      contentLength: p.content.length,
    })),
  });

  // Fetch relevant canonical facts for world consistency
  log.debug(`Request #${genId}: Fetching relevant canonical facts`);
  const canonicalFacts = await getRelevantFactsForGeneration(seed);
  
  log.info(`Request #${genId}: Canonical facts retrieved`, {
    factCount: canonicalFacts.length,
    factNames: canonicalFacts.map(f => f.name),
  });

  // Fetch hierarchical summaries (bookArc, runningSummary, chunkSummaries)
  log.debug(`Request #${genId}: Fetching hierarchical context`);
  const { bookArc, runningSummary, chunkSummaries } = await getContextForGeneration(seed, pageNumber);
  
  log.info(`Request #${genId}: Hierarchical context retrieved`, {
    hasBookArc: !!bookArc,
    hasRunningSummary: !!runningSummary,
    chunkCount: chunkSummaries.length,
    narrativeMode: bookArc?.narrativeMode,
  });

  // Build generation context
  const context: GenerationContext = {
    seed,
    pageNumber,
    prevPages,
    canonicalFacts,
    bookArc: bookArc || undefined,
    runningSummary: runningSummary || undefined,
    chunkSummaries,
    // Only include referrer context for page 1 when no previous pages exist
    referrerContext: pageNumber === 1 && prevPages.length === 0 ? referrerContext : undefined,
  };
  
  log.debug(`Request #${genId}: Generation context prepared`, {
    seed: context.seed,
    pageNumber: context.pageNumber,
    prevPagesCount: context.prevPages.length,
    canonicalFactsCount: context.canonicalFacts?.length || 0,
    hasBookArc: !!context.bookArc,
    hasRunningSummary: !!context.runningSummary,
    chunkSummaryCount: context.chunkSummaries?.length || 0,
    includesReferrerContext: !!context.referrerContext,
  });

  // Build the prompt from context
  log.debug(`Request #${genId}: Building prompt from context`);
  const prompt = buildPrompt(context);
  
  log.info(`Request #${genId}: Prompt built`, {
    promptLength: prompt.length,
  });

  // Generate content via LLM with Langfuse tracing
  const isCoreSeed = seed === CORE_NARRATIVE_SEED;
  const generationMetadata: GenerationMetadata = {
    seed,
    pageNumber,
    isCoreSeed,
    narrativeMode: bookArc?.narrativeMode,
  };
  
  log.info(`Request #${genId}: Calling LLM for content generation`, { isCoreSeed });
  const startTime = performance.now();
  const { content, traceId } = await generatePageContent(prompt, isCoreSeed, generationMetadata);
  const generationTime = performance.now() - startTime;
  
  log.info(`Request #${genId}: LLM generation complete`, {
    generationTime: `${generationTime.toFixed(2)}ms`,
    contentLength: content.length,
    wordCount: content.split(/\s+/).length,
    traceId,
  });

  // Extract metadata
  log.debug(`Request #${genId}: Extracting metadata from generated content`);
  const opening = extractOpening(content);
  const closing = extractClosing(content);
  const references = extractReferences(content);

  // Build the complete prompt (system + user) for storage
  const completePrompt = buildCompletePrompt(prompt, isCoreSeed);

  // Build page object
  const newPage: Page = {
    seed,
    pageNumber,
    content,
    opening,
    closing,
    references,
    generationPrompt: completePrompt,
    // Only store referrer for page 1 (how this book was discovered)
    referrerSeed: pageNumber === 1 && referrerContext ? referrerContext.seed : undefined,
    referrerPage: pageNumber === 1 && referrerContext ? referrerContext.pageNumber : undefined,
  };
  
  log.debug(`Request #${genId}: Page object constructed`, {
    seed: newPage.seed,
    pageNumber: newPage.pageNumber,
    contentLength: newPage.content.length,
    openingLength: newPage.opening.length,
    closingLength: newPage.closing.length,
    referencesCount: newPage.references.length,
    generationPromptLength: newPage.generationPrompt?.length,
    referrerSeed: newPage.referrerSeed,
    referrerPage: newPage.referrerPage,
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
    traceId,
    references: savedPage.references.map(r => r.text),
  });
  
  // Schedule background extraction tasks (won't block response)
  scheduleFactExtraction(savedPage);
  scheduleArcGeneration(savedPage);        // Generate book arc for page 1
  scheduleChunkAndMomentum(savedPage);     // Generate chunk summary and update momentum at pages 5, 10, 15...
  
  // Schedule Langfuse evaluation (if tracing is enabled)
  if (traceId) {
    scheduleEvaluation(savedPage, traceId, {
      discrete: true,
      qualitative: true,  // Run all qualitative evaluations
      metadata: {
        seed,
        pageNumber,
        isCoreSeed,
        narrativeMode: bookArc?.narrativeMode,
      },
    });
  }
  
  return savedPage;
}

export async function* streamOrGetPage(
  seed: string,
  pageNumber: number,
  referrerContext?: ReferrerContext,
  isCanonicalSeed: boolean = false
): AsyncGenerator<
  | { type: 'existing'; page: Page }
  | { type: 'chunk'; text: string }
  | { type: 'complete'; page: Page }
  | { type: 'waiting'; message: string },
  void,
  unknown
> {
  const genId = ++totalGenerations;
  const key = pageKey(seed, pageNumber);
  
  log.separator(`STREAMING PAGE REQUEST #${genId}: "${seed}" p.${pageNumber}`);
  
  log.info(`Stream #${genId}: streamOrGetPage called`, {
    seed,
    pageNumber,
    hasReferrerContext: !!referrerContext,
    referrerSeed: referrerContext?.seed,
    referrerPage: referrerContext?.pageNumber,
    isCanonicalSeed,
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
  
  // Check if generation is already in progress (prevents duplicate work)
  const inProgressPromise = generationsInProgress.get(key);
  if (inProgressPromise) {
    inProgressHits++;
    log.info(`Stream #${genId}: GENERATION ALREADY IN PROGRESS - waiting for existing generation`, {
      seed,
      pageNumber,
      key,
      inProgressHits,
      inProgressCount: generationsInProgress.size,
    });
    
    // Wait for the in-progress generation to complete
    const page = await inProgressPromise;
    log.info(`Stream #${genId}: In-progress generation completed, returning as existing`, {
      seed,
      pageNumber,
      contentLength: page.content.length,
    });
    // Return the result as if it was an existing page (since it is now)
    yield { type: 'existing', page };
    return;
  }
  
  // ACCESS CONTROL: Validate that this page can be generated
  log.debug(`Stream #${genId}: Validating generation access`);
  await validateGenerationAccess(seed, pageNumber, referrerContext, isCanonicalSeed);
  
  // Wait for required context, yielding 'waiting' events to inform the frontend
  log.debug(`Stream #${genId}: Checking required context availability`);
  yield* waitForRequiredContextWithEvents(seed, pageNumber);
  
  cacheMisses++;
  streamGenerations++;
  
  log.info(`Stream #${genId}: PAGE NOT FOUND - Beginning streaming generation (cache miss)`, {
    seed,
    pageNumber,
    streamGenerations,
    cacheMissRate: `${((cacheMisses / totalGenerations) * 100).toFixed(1)}%`,
  });
  
  // For streaming, we need to handle the in-progress tracking differently
  // We create a deferred promise that we'll resolve when streaming completes
  let resolveGeneration: (page: Page) => void;
  let rejectGeneration: (error: Error) => void;
  const generationPromise = new Promise<Page>((resolve, reject) => {
    resolveGeneration = resolve;
    rejectGeneration = reject;
  });
  
  generationsInProgress.set(key, generationPromise);
  log.debug(`Stream #${genId}: Registered streaming generation in progress`, {
    key,
    inProgressCount: generationsInProgress.size,
  });

  try {
    // Fetch previous pages for context (now 3 pages instead of 2)
    log.debug(`Stream #${genId}: Fetching previous pages for continuity`);
    const prevPages = await getPreviousPages(seed, pageNumber);
    
    log.info(`Stream #${genId}: Previous pages context assembled`, {
      prevPages: prevPages.map(p => ({
        pageNumber: p.pageNumber,
        openingPreview: p.opening.slice(0, 50) + '...',
      })),
    });

    // Fetch relevant canonical facts for world consistency
    log.debug(`Stream #${genId}: Fetching relevant canonical facts`);
    const canonicalFacts = await getRelevantFactsForGeneration(seed);
    
    log.info(`Stream #${genId}: Canonical facts retrieved`, {
      factCount: canonicalFacts.length,
      factNames: canonicalFacts.map(f => f.name),
    });

    // Fetch hierarchical summaries (bookArc, runningSummary, chunkSummaries)
    log.debug(`Stream #${genId}: Fetching hierarchical context`);
    const { bookArc, runningSummary, chunkSummaries } = await getContextForGeneration(seed, pageNumber);
    
    log.info(`Stream #${genId}: Hierarchical context retrieved`, {
      hasBookArc: !!bookArc,
      hasRunningSummary: !!runningSummary,
      chunkCount: chunkSummaries.length,
      narrativeMode: bookArc?.narrativeMode,
    });

    // Build generation context
    const context: GenerationContext = {
      seed,
      pageNumber,
      prevPages,
      canonicalFacts,
      bookArc: bookArc || undefined,
      runningSummary: runningSummary || undefined,
      chunkSummaries,
      // Only include referrer context for page 1 when no previous pages exist
      referrerContext: pageNumber === 1 && prevPages.length === 0 ? referrerContext : undefined,
    };
    
    log.debug(`Stream #${genId}: Generation context prepared for streaming`, {
      includesReferrerContext: !!context.referrerContext,
      hasBookArc: !!context.bookArc,
      hasRunningSummary: !!context.runningSummary,
      contextSummary: {
        prevPages: context.prevPages.length,
        canonicalFacts: context.canonicalFacts?.length || 0,
        chunkSummaries: context.chunkSummaries?.length || 0,
      },
    });

    // Build the prompt from context
    log.debug(`Stream #${genId}: Building prompt from context`);
    const prompt = buildPrompt(context);
    
    log.info(`Stream #${genId}: Prompt built`, {
      promptLength: prompt.length,
    });

    // Stream content from LLM with Langfuse tracing
    const isCoreSeed = seed === CORE_NARRATIVE_SEED;
    const streamMetadata: GenerationMetadata = {
      seed,
      pageNumber,
      isCoreSeed,
      narrativeMode: bookArc?.narrativeMode,
    };
    
    log.info(`Stream #${genId}: Starting LLM stream`, { isCoreSeed });
    const startTime = performance.now();
    let fullContent = '';
    let chunkCount = 0;
    
    // Use the new tracing-enabled streaming function
    const { generator, traceId } = streamPageContentWithTrace(prompt, isCoreSeed, streamMetadata);
    
    log.debug(`Stream #${genId}: Stream initialized`, { traceId });
    
    for await (const chunk of generator) {
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
      traceId,
    });

    // Extract metadata
    log.debug(`Stream #${genId}: Extracting metadata from streamed content`);
    const opening = extractOpening(fullContent);
    const closing = extractClosing(fullContent);
    const references = extractReferences(fullContent);

    // Build the complete prompt (system + user) for storage
    const completePrompt = buildCompletePrompt(prompt, isCoreSeed);

    // Build page object
    const newPage: Page = {
      seed,
      pageNumber,
      content: fullContent,
      opening,
      closing,
      references,
      generationPrompt: completePrompt,
      // Only store referrer for page 1 (how this book was discovered)
      referrerSeed: pageNumber === 1 && referrerContext ? referrerContext.seed : undefined,
      referrerPage: pageNumber === 1 && referrerContext ? referrerContext.pageNumber : undefined,
    };
    
    log.debug(`Stream #${genId}: Page object constructed from stream`, {
      contentLength: newPage.content.length,
      openingLength: newPage.opening.length,
      closingLength: newPage.closing.length,
      referencesCount: newPage.references.length,
      generationPromptLength: newPage.generationPrompt?.length,
      referrerSeed: newPage.referrerSeed,
      referrerPage: newPage.referrerPage,
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
      traceId,
      references: savedPage.references.map(r => r.text),
    });
    
    // Schedule background extraction tasks (won't block response)
    scheduleFactExtraction(savedPage);
    scheduleArcGeneration(savedPage);        // Generate book arc for page 1
    scheduleChunkAndMomentum(savedPage);     // Generate chunk summary and update momentum at pages 5, 10, 15...
    
    // Schedule Langfuse evaluation (if tracing is enabled)
    if (traceId) {
      scheduleEvaluation(savedPage, traceId, {
        discrete: true,
        qualitative: true,  // Run all qualitative evaluations
        metadata: {
          seed,
          pageNumber,
          isCoreSeed,
          narrativeMode: bookArc?.narrativeMode,
        },
      });
    }
    
    // Resolve the promise so any waiters get the result
    resolveGeneration!(savedPage);
    
    yield { type: 'complete', page: savedPage };
  } catch (error) {
    // Reject the promise so waiters know about the failure
    rejectGeneration!(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    // Always clean up the in-progress registry
    generationsInProgress.delete(key);
    log.debug(`Stream #${genId}: Removed from in-progress registry`, {
      key,
      inProgressCount: generationsInProgress.size,
    });
  }
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
    inProgressHits,
    currentInProgress: generationsInProgress.size,
    inProgressKeys: Array.from(generationsInProgress.keys()),
  };
}
