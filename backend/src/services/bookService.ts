import Anthropic from '@anthropic-ai/sdk';
import { Page, BookSynopsis } from '../types';
import { saveBookSynopsis, getBookSynopsis, updateSynopsisInDb, getBookEventsWeighted } from './database';
import { createLogger } from './logger';

const log = createLogger('book');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Use Sonnet for synopsis extraction (fast, good quality, cost-effective)
const SYNOPSIS_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Generate a synopsis from page 1 of a book.
 * This extracts the essence of what the book is about, its narrative mode,
 * and the specific situation established on page 1.
 */
export async function generateBookSynopsis(page: Page): Promise<BookSynopsis | null> {
  // Only generate for page 1
  if (page.pageNumber !== 1) {
    return null;
  }

  log.info('Generating book synopsis', {
    seed: page.seed,
    contentLength: page.content.length,
  });

  const prompt = `<task>
You're analyzing page 1 of a book titled "${page.seed}" to create metadata for maintaining narrative consistency across future pages.

<page_1>
${page.content}
</page_1>

Generate:
1. A 2-3 sentence SYNOPSIS of what this book appears to be about, based on page 1. Focus on the central tension, character(s), or situation.
2. The NARRATIVE_MODE: one of:
   - "character" (focuses on a person's experience/journey)
   - "place" (focuses on a location and what happens there)
   - "document" (presented as a letter, memo, form, or other document)
   - "event" (focuses on something that happened or is happening)
   - "concept" (explores an idea, system, or phenomenon)
3. The OPENING_SITUATION: A 1-sentence description of the specific scene, moment, or situation established on page 1.

Return JSON only, no other text:
{
  "synopsis": "...",
  "narrative_mode": "character|place|document|event|concept",
  "opening_situation": "..."
}
</task>`;

  try {
    const response = await anthropic.messages.create({
      model: SYNOPSIS_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      log.warn('No text in synopsis response');
      return null;
    }

    // Parse the JSON response (handle potential markdown code blocks)
    let result: { synopsis: string; narrative_mode: string; opening_situation: string };
    let jsonText = textBlock.text.trim();
    
    // Strip markdown code block if present
    if (jsonText.startsWith('```')) {
      // Remove opening ```json or ``` and closing ```
      jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    
    try {
      result = JSON.parse(jsonText);
    } catch (parseError) {
      log.error('Failed to parse synopsis JSON', {
        response: jsonText.slice(0, 500),
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return null;
    }

    // Validate the response has required fields
    if (!result.synopsis || !result.narrative_mode || !result.opening_situation) {
      log.warn('Synopsis response missing required fields', {
        hasSynopsis: !!result.synopsis,
        hasNarrativeMode: !!result.narrative_mode,
        hasOpeningSituation: !!result.opening_situation,
      });
      return null;
    }

    const synopsis: BookSynopsis = {
      seed: page.seed,
      synopsis: result.synopsis,
      narrativeMode: result.narrative_mode,
      openingSituation: result.opening_situation,
    };

    log.info('Book synopsis generated', {
      seed: page.seed,
      narrativeMode: synopsis.narrativeMode,
      synopsisLength: synopsis.synopsis.length,
      openingSituationLength: synopsis.openingSituation.length,
    });

    return synopsis;
  } catch (error) {
    log.error('Synopsis generation failed', {
      seed: page.seed,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Schedule synopsis generation to run asynchronously after page 1 is saved.
 * This prevents synopsis generation from slowing down the page response.
 */
export function scheduleSynopsisGeneration(page: Page): void {
  // Only generate for page 1
  if (page.pageNumber !== 1) {
    return;
  }

  log.info('Scheduling synopsis generation', { seed: page.seed });

  setImmediate(async () => {
    try {
      const synopsis = await generateBookSynopsis(page);
      if (synopsis) {
        await saveBookSynopsis(synopsis);
        log.info('Synopsis saved to database', { seed: page.seed });
      }
    } catch (error) {
      log.error('Background synopsis generation failed', {
        seed: page.seed,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

/**
 * Update a book's synopsis to reflect current story state.
 * Uses recent events to inform what the story is about NOW, not just what it started as.
 */
export async function updateBookSynopsis(seed: string, currentPage: number): Promise<void> {
  log.info('Updating book synopsis', { seed, currentPage });

  // Get original synopsis
  const original = await getBookSynopsis(seed);
  if (!original) {
    log.warn('No original synopsis found for update', { seed });
    return;
  }

  // Get recent events for context
  const events = await getBookEventsWeighted(seed, currentPage + 1, 8);
  if (events.length === 0) {
    log.debug('No events to inform synopsis update', { seed });
    return;
  }

  const eventsText = events
    .map(e => `- Page ${e.pageNumber}: ${e.event}`)
    .join('\n');

  const prompt = `<task>
This book's original synopsis (from page 1):
${original.synopsis}

Original narrative mode: ${original.narrativeMode}
Original opening situation: ${original.openingSituation}

Events that have happened (pages 1-${currentPage}):
${eventsText}

Write an updated 2-3 sentence synopsis reflecting where the story is NOW.
Focus on current situation and momentum, not history.
Keep the same narrative mode (${original.narrativeMode}).

Return ONLY the synopsis text, no other commentary.
</task>`;

  try {
    const response = await anthropic.messages.create({
      model: SYNOPSIS_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      log.warn('No text in synopsis update response');
      return;
    }

    const updatedSynopsis = textBlock.text.trim();

    await updateSynopsisInDb(seed, updatedSynopsis, currentPage);

    log.info('Synopsis updated', {
      seed,
      currentPage,
      updatedLength: updatedSynopsis.length,
    });
  } catch (error) {
    log.error('Synopsis update failed', {
      seed,
      currentPage,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Schedule synopsis update to run asynchronously after page generation.
 * Updates every 5 pages (pages 5, 10, 15, 20...) to keep synopsis current with story evolution.
 */
export function scheduleSynopsisUpdate(page: Page): void {
  // Update at pages 5, 10, 15, 20...
  if (page.pageNumber > 1 && page.pageNumber % 5 === 0) {
    log.info('Scheduling synopsis update', { seed: page.seed, pageNumber: page.pageNumber });

    setImmediate(async () => {
      try {
        await updateBookSynopsis(page.seed, page.pageNumber);
      } catch (error) {
        log.error('Background synopsis update failed', {
          seed: page.seed,
          pageNumber: page.pageNumber,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }
}

