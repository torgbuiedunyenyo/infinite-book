import Anthropic from '@anthropic-ai/sdk';
import { Page, BookSynopsis } from '../types';
import { saveBookSynopsis } from './database';
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

