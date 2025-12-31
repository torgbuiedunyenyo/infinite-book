/**
 * Summary Service: Hierarchical narrative consistency system.
 * 
 * Replaces the old bookService.ts and eventsService.ts with a coherent hierarchy:
 * 
 * 1. Book Narrative Arc - created at page 1, never updated
 *    Rich 150-250 word document about the story's DNA
 * 
 * 2. Chunk Summaries - created at pages 5, 10, 15, 20...
 *    Factual summaries of 5-page segments (complete coverage, no gaps)
 * 
 * 3. Running Summary - created at page 5, updated at 10, 15, 20...
 *    Current momentum and story state (WHERE the story IS NOW)
 * 
 * All extraction uses Opus 4.5 with full world context to prevent
 * misinterpretation (e.g., the old "Jay is son of Tan" error).
 */

import Anthropic from '@anthropic-ai/sdk';
import { Page, BookArc, ChunkSummary, RunningSummary } from '../types';
import { 
  saveBookArc, 
  getBookArc,
  saveChunkSummary,
  getChunkSummaries,
  saveRunningSummary,
  getRunningSummary,
  getPagesRange
} from './database';
import { EXTRACTION_SYSTEM } from '../prompts/templates';
import { createLogger } from './logger';

const log = createLogger('summary');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Use Opus 4.5 for all extraction - quality over cost/latency
// This prevents misinterpretation errors that occurred with Sonnet
const MODEL = 'claude-opus-4-5-20251101';
const THINKING_BUDGET = 10000;

// ==================== BOOK NARRATIVE ARC ====================

/**
 * Generate the Book Narrative Arc from page 1.
 * This is the story's DNA - a rich 150-250 word document that guides ALL future pages.
 * 
 * Replaces the old BookSynopsis which had 4 redundant representations of page 1.
 */
export async function generateBookArc(seed: string, page1Content: string): Promise<BookArc | null> {
  log.info('Generating book narrative arc', {
    seed,
    contentLength: page1Content.length,
  });

  const prompt = `${EXTRACTION_SYSTEM}

<task>
You've read page 1 of a book titled "${seed}". Extract the FULL NARRATIVE ARC.

This is the story's DNA—a rich document that will guide all future page generation. Write 150-250 words covering:

- What is this book fundamentally about? What experience does it offer the reader?
- Who is the protagonist (if any) and what do they want?
- What is the central tension, conflict, or question?
- What trajectory does page 1 set in motion? Where might this go?
- What themes are being explored?
- How does this connect to or diverge from the Jay/Tan narrative?
- What voice and tone has been established?

Also determine the narrative mode:
- "character" - focuses on a person's experience/journey
- "place" - focuses on a location and what happens there
- "document" - presented as a letter, memo, form, or other document
- "event" - focuses on something that happened or is happening
- "concept" - explores an idea, system, or phenomenon

<page_1 seed="${seed}">
${page1Content}
</page_1>
</task>

<output_format>
Return JSON only, no other text:
{
  "narrative_arc": "150-250 words of rich narrative planning...",
  "narrative_mode": "character|place|document|event|concept"
}
</output_format>`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,  // Must be greater than THINKING_BUDGET (10000)
      thinking: {
        type: 'enabled',
        budget_tokens: THINKING_BUDGET,
      },
      messages: [{ role: 'user', content: prompt }],
    });

    // Extract text from response
    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      log.warn('No text in book arc response', { seed });
      return null;
    }

    // Parse JSON (handle potential markdown code blocks)
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const result = JSON.parse(jsonText);

    if (!result.narrative_arc || !result.narrative_mode) {
      log.warn('Book arc response missing required fields', {
        seed,
        hasArc: !!result.narrative_arc,
        hasMode: !!result.narrative_mode,
      });
      return null;
    }

    const bookArc: BookArc = {
      seed,
      narrativeArc: result.narrative_arc,
      narrativeMode: result.narrative_mode,
    };

    log.info('Book narrative arc generated', {
      seed,
      narrativeMode: bookArc.narrativeMode,
      arcLength: bookArc.narrativeArc.length,
    });

    return bookArc;
  } catch (error) {
    log.error('Book arc generation failed', {
      seed,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ==================== CHUNK SUMMARIES ====================

/**
 * Generate a Chunk Summary for a 5-page segment.
 * These provide complete coverage of story history with no gaps.
 * 
 * Replaces StoryEvent system which had a broken selection algorithm
 * that created gaps (pages 4-7 were never represented).
 */
export async function generateChunkSummary(
  seed: string,
  chunkStart: number,
  chunkEnd: number,
  pagesContent: Page[],
  bookArc: BookArc
): Promise<ChunkSummary | null> {
  log.info('Generating chunk summary', {
    seed,
    chunkStart,
    chunkEnd,
    pageCount: pagesContent.length,
  });

  const pagesText = pagesContent
    .map(p => `<page number="${p.pageNumber}">\n${p.content}\n</page>`)
    .join('\n\n');

  const prompt = `${EXTRACTION_SYSTEM}

<book_narrative_arc>
${bookArc.narrativeArc}
</book_narrative_arc>

<task>
Summarize pages ${chunkStart}-${chunkEnd} of "${seed}".

This summary will be used to prevent repetition and maintain continuity when generating future pages. Focus on:

- Key events and actions that happened
- Character developments and revelations
- Plot progressions and complications
- Elements introduced that matter going forward
- Specific details that shouldn't be contradicted or repeated

Be factual and concrete. Write 75-125 words.

<pages>
${pagesText}
</pages>
</task>

<output_format>
Return only the summary text, no JSON wrapper or other formatting.
</output_format>`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,  // Must be greater than THINKING_BUDGET (10000)
      thinking: {
        type: 'enabled',
        budget_tokens: THINKING_BUDGET,
      },
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      log.warn('No text in chunk summary response', { seed, chunkStart, chunkEnd });
      return null;
    }

    const summary = textBlock.text.trim();

    const chunkSummary: ChunkSummary = {
      seed,
      chunkStart,
      chunkEnd,
      summary,
    };

    log.info('Chunk summary generated', {
      seed,
      chunkStart,
      chunkEnd,
      summaryLength: summary.length,
    });

    return chunkSummary;
  } catch (error) {
    log.error('Chunk summary generation failed', {
      seed,
      chunkStart,
      chunkEnd,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ==================== RUNNING SUMMARY ====================

/**
 * Generate or update the Running Summary.
 * Tracks WHERE the story IS NOW - current tensions, character positions, direction.
 * 
 * Created at page 5, updated at pages 10, 15, 20...
 */
export async function generateRunningSummary(
  seed: string,
  currentPage: number,
  bookArc: BookArc,
  previousMomentum: string | null,
  latestChunkSummary: string
): Promise<RunningSummary | null> {
  log.info('Generating running summary', {
    seed,
    currentPage,
    hasPreviousMomentum: !!previousMomentum,
  });

  const prompt = `${EXTRACTION_SYSTEM}

<book_narrative_arc>
${bookArc.narrativeArc}
</book_narrative_arc>

${previousMomentum ? `<previous_momentum>
${previousMomentum}
</previous_momentum>` : ''}

<latest_events>
${latestChunkSummary}
</latest_events>

<task>
Write a MOMENTUM summary for "${seed}" after page ${currentPage}.

Focus on WHERE THE STORY IS NOW, not its history:
- Current state: What situation are characters in right now?
- Active tensions: What conflicts are unresolved? What pressures exist?
- Character positions: Where do characters stand relative to each other?
- Thematic direction: What themes are being developed?
- Story momentum: Is the story escalating? Complicating? Approaching crisis?

Write 75-125 words about CURRENT STATE, not a recap of events.
</task>

<output_format>
Return only the momentum summary text, no JSON wrapper or other formatting.
</output_format>`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,  // Must be greater than THINKING_BUDGET (10000)
      thinking: {
        type: 'enabled',
        budget_tokens: THINKING_BUDGET,
      },
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      log.warn('No text in running summary response', { seed, currentPage });
      return null;
    }

    const momentum = textBlock.text.trim();

    const runningSummary: RunningSummary = {
      seed,
      momentum,
      lastUpdatedPage: currentPage,
    };

    log.info('Running summary generated', {
      seed,
      currentPage,
      momentumLength: momentum.length,
    });

    return runningSummary;
  } catch (error) {
    log.error('Running summary generation failed', {
      seed,
      currentPage,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ==================== SCHEDULING ====================

// Max retries for background arc generation
const ARC_GENERATION_MAX_RETRIES = 3;

/**
 * Schedule Book Arc generation after page 1 is saved.
 * Runs asynchronously to avoid blocking the response.
 * Includes retry logic to handle transient failures.
 */
export function scheduleArcGeneration(page: Page): void {
  if (page.pageNumber !== 1) {
    return;
  }

  log.info('Scheduling book arc generation', { seed: page.seed });

  setImmediate(async () => {
    for (let attempt = 1; attempt <= ARC_GENERATION_MAX_RETRIES; attempt++) {
      try {
        log.info(`Book arc generation attempt ${attempt}/${ARC_GENERATION_MAX_RETRIES}`, { seed: page.seed });
        
        const arc = await generateBookArc(page.seed, page.content);
        if (arc) {
          await saveBookArc(arc);
          log.info('Book arc saved to database', { seed: page.seed, attempt });
          return; // Success - exit retry loop
        } else {
          log.warn(`Book arc generation returned null (attempt ${attempt}/${ARC_GENERATION_MAX_RETRIES})`, {
            seed: page.seed,
          });
        }
      } catch (error) {
        log.error(`Background book arc generation failed (attempt ${attempt}/${ARC_GENERATION_MAX_RETRIES})`, {
          seed: page.seed,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      
      // Wait before retry (except on last attempt)
      if (attempt < ARC_GENERATION_MAX_RETRIES) {
        log.info(`Waiting 10s before retry...`, { seed: page.seed });
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    // All retries failed
    log.error(`Book arc generation FAILED after ${ARC_GENERATION_MAX_RETRIES} attempts`, {
      seed: page.seed,
    });
  });
}

/**
 * Schedule Chunk Summary and Running Summary generation.
 * Only runs at chunk boundaries: pages 5, 10, 15, 20...
 */
export function scheduleChunkAndMomentum(page: Page): void {
  // Only at chunk boundaries
  if (page.pageNumber < 5 || page.pageNumber % 5 !== 0) {
    return;
  }

  log.info('Scheduling chunk and momentum generation', {
    seed: page.seed,
    pageNumber: page.pageNumber,
  });

  setImmediate(async () => {
    try {
      const chunkStart = page.pageNumber - 4; // e.g., page 5 → chunk 1-5
      const chunkEnd = page.pageNumber;

      // Get the book arc (required for summaries)
      const bookArc = await getBookArc(page.seed);
      if (!bookArc) {
        log.warn('No book arc found, skipping chunk/momentum generation', {
          seed: page.seed,
        });
        return;
      }

      // Get pages for this chunk
      const pages = await getPagesRange(page.seed, chunkStart, chunkEnd);
      if (pages.length === 0) {
        log.warn('No pages found for chunk', {
          seed: page.seed,
          chunkStart,
          chunkEnd,
        });
        return;
      }

      // Generate and save chunk summary
      const chunkSummary = await generateChunkSummary(
        page.seed,
        chunkStart,
        chunkEnd,
        pages,
        bookArc
      );
      
      if (chunkSummary) {
        await saveChunkSummary(chunkSummary);
        log.info('Chunk summary saved', {
          seed: page.seed,
          chunkStart,
          chunkEnd,
        });

        // Generate and save running summary
        const prevMomentum = await getRunningSummary(page.seed);
        const runningSummary = await generateRunningSummary(
          page.seed,
          page.pageNumber,
          bookArc,
          prevMomentum?.momentum || null,
          chunkSummary.summary
        );

        if (runningSummary) {
          await saveRunningSummary(runningSummary);
          log.info('Running summary saved', {
            seed: page.seed,
            pageNumber: page.pageNumber,
          });
        }
      }
    } catch (error) {
      log.error('Background chunk/momentum generation failed', {
        seed: page.seed,
        pageNumber: page.pageNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

// ==================== RETRIEVAL FOR GENERATION ====================

/**
 * Get all context for page generation.
 * This is the main entry point called by pageGenerator.
 */
export async function getContextForGeneration(
  seed: string,
  pageNumber: number
): Promise<{
  bookArc: BookArc | null;
  runningSummary: RunningSummary | null;
  chunkSummaries: ChunkSummary[];
}> {
  log.debug('Getting context for generation', { seed, pageNumber });

  // Book arc (always retrieve for pages > 1)
  const bookArc = pageNumber > 1 ? await getBookArc(seed) : null;

  // Running summary (only relevant for pages > 5)
  const runningSummary = pageNumber > 5 ? await getRunningSummary(seed) : null;

  // Chunk summaries (all completed chunks before this page)
  const chunkSummaries = pageNumber > 5 ? await getChunkSummaries(seed, pageNumber) : [];

  log.info('Context retrieved for generation', {
    seed,
    pageNumber,
    hasBookArc: !!bookArc,
    hasRunningSummary: !!runningSummary,
    chunkCount: chunkSummaries.length,
  });

  return { bookArc, runningSummary, chunkSummaries };
}

