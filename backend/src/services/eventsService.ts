import Anthropic from '@anthropic-ai/sdk';
import { Page, StoryEvent } from '../types';
import { saveStoryEvent, getBookEventsWeighted } from './database';
import { createLogger } from './logger';

const log = createLogger('events');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Use Sonnet 4.5 for event extraction (fast, good quality)
const EXTRACTION_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Extract narrative events from a newly generated page.
 * Events are things that HAPPENED — actions, discoveries, decisions, arrivals, departures.
 * This runs asynchronously after page generation to avoid slowing down responses.
 */
export async function extractEventsFromPage(page: Page): Promise<StoryEvent[]> {
  log.info('Extracting events from page', {
    seed: page.seed,
    pageNumber: page.pageNumber,
    contentLength: page.content.length,
  });

  const prompt = `<task>
Extract 1-3 narrative events from this page of fiction. Events are things that HAPPENED — 
actions, discoveries, decisions, arrivals, departures, revelations.

For each event, indicate:
- "key" if it changes the situation (a revelation, a major action, a turning point)
- "minor" if it's part of ongoing action but doesn't shift the story

<page seed="${page.seed}" page_number="${page.pageNumber}">
${page.content}
</page>
</task>

<output_format>
Return a JSON array. Each event should have:
- event: One sentence describing what happened (past tense, concise)
- significance: "key" or "minor"
- entities: Array of character/place names involved

Example:
[
  {"event": "Jay gave Tan the clef for free", "significance": "key", "entities": ["Jay", "Tan"]},
  {"event": "Tan asked about the payment system", "significance": "minor", "entities": ["Tan"]}
]

If nothing significant happened (pure description/reflection with no action), return: []

Return ONLY the JSON array, no other text.
</output_format>`;

  try {
    const response = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      log.warn('No text in event extraction response');
      return [];
    }

    // Parse the JSON response (strip markdown code blocks if present)
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    let extractedEvents: Array<{ event: string; significance: string; entities: string[] }>;
    try {
      extractedEvents = JSON.parse(jsonText);
    } catch (parseError) {
      log.error('Failed to parse event extraction JSON', {
        response: jsonText.slice(0, 500),
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return [];
    }

    if (!Array.isArray(extractedEvents)) {
      log.warn('Event extraction did not return an array', {
        type: typeof extractedEvents,
      });
      return [];
    }

    log.info('Events extracted from page', {
      seed: page.seed,
      pageNumber: page.pageNumber,
      eventCount: extractedEvents.length,
      events: extractedEvents.map(e => ({ event: e.event.slice(0, 50), sig: e.significance })),
    });

    // Save each event to the database
    const savedEvents: StoryEvent[] = [];
    for (const evt of extractedEvents) {
      // Validate the event structure
      if (!evt.event || !evt.significance) {
        log.warn('Skipping malformed event', { event: evt });
        continue;
      }

      // Validate significance
      if (!['key', 'minor'].includes(evt.significance)) {
        log.warn('Skipping event with invalid significance', { significance: evt.significance });
        continue;
      }

      try {
        const storyEvent: StoryEvent = {
          seed: page.seed,
          pageNumber: page.pageNumber,
          event: evt.event,
          significance: evt.significance as 'key' | 'minor',
          entities: evt.entities || [],
        };

        const saved = await saveStoryEvent(storyEvent);
        savedEvents.push(saved);
      } catch (saveError) {
        log.error('Failed to save event', {
          event: evt,
          error: saveError instanceof Error ? saveError.message : String(saveError),
        });
      }
    }

    log.info('Events saved to database', {
      seed: page.seed,
      pageNumber: page.pageNumber,
      savedCount: savedEvents.length,
    });

    return savedEvents;
  } catch (error) {
    log.error('Event extraction failed', {
      seed: page.seed,
      pageNumber: page.pageNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Schedule event extraction to run asynchronously after page generation.
 * This prevents event extraction from slowing down the page response.
 */
export function scheduleEventExtraction(page: Page): void {
  setImmediate(async () => {
    try {
      await extractEventsFromPage(page);
    } catch (error) {
      log.error('Background event extraction failed', {
        seed: page.seed,
        pageNumber: page.pageNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

/**
 * Get story events for generation context.
 * Uses weighted selection to include recent events AND key events from earlier pages.
 */
export async function getEventsForGeneration(
  seed: string,
  pageNumber: number
): Promise<StoryEvent[]> {
  // No events needed for page 1
  if (pageNumber <= 1) {
    return [];
  }
  
  return getBookEventsWeighted(seed, pageNumber, 10);
}

