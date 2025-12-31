import Anthropic from '@anthropic-ai/sdk';
import { CanonicalFact, Page } from '../types';
import { saveCanonicalFact, getRelevantFactsWithBookPriority } from './database';
import { factsLogger } from './logger';

const log = factsLogger;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Use Sonnet 4.5 for fact extraction (balanced performance)
const EXTRACTION_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Extract canonical facts from a newly generated page.
 * This runs asynchronously after page generation to avoid slowing down responses.
 */
export async function extractFactsFromPage(page: Page): Promise<CanonicalFact[]> {
  log.info('Extracting facts from page', {
    seed: page.seed,
    pageNumber: page.pageNumber,
    contentLength: page.content.length,
  });

  const prompt = `<task>
Extract any NEW concrete facts about characters, places, events, objects, or relationships from this page of fiction. These facts will be used to maintain consistency across other books in the same world.

Only extract facts that are:
- Concrete and specific (not vague descriptions)
- About named entities (characters, places, objects)
- Establishable details that should remain consistent

Do NOT extract:
- Mood, atmosphere, or tone
- Vague descriptions
- Opinions or subjective judgments
- Things that are only implied or speculated

<page seed="${page.seed}" page_number="${page.pageNumber}">
${page.content}
</page>
</task>

<output_format>
Return a JSON array of facts. Each fact should have:
- category: one of "character", "place", "event", "object", "relationship"
- name: the entity this fact is about (use consistent naming)
- fact: a single, specific fact (one sentence)

Example:
[
  {"category": "character", "name": "Jay", "fact": "Works at a shop in Oakland that sells clef to tourists."},
  {"category": "place", "name": "The shop", "fact": "Located on a corner in Oakland, open late."},
  {"category": "relationship", "name": "Jay and Tan", "fact": "Met when Tan couldn't figure out how to pay with his phone."}
]

If no concrete facts can be extracted, return an empty array: []

Return ONLY the JSON array, no other text.
</output_format>`;

  try {
    const response = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      log.warn('No text in fact extraction response');
      return [];
    }

    // Parse the JSON response (strip markdown code blocks if present)
    let extractedFacts: Array<{ category: string; name: string; fact: string }>;
    try {
      let jsonText = textBlock.text.trim();
      // Strip markdown code block wrapper if present
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      extractedFacts = JSON.parse(jsonText);
    } catch (parseError) {
      log.error('Failed to parse fact extraction JSON', {
        response: textBlock.text.slice(0, 500),
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return [];
    }

    if (!Array.isArray(extractedFacts)) {
      log.warn('Fact extraction did not return an array', {
        type: typeof extractedFacts,
      });
      return [];
    }

    log.info('Facts extracted from page', {
      seed: page.seed,
      pageNumber: page.pageNumber,
      factCount: extractedFacts.length,
      facts: extractedFacts.map(f => `${f.category}: ${f.name}`),
    });

    // Save each fact to the database
    const savedFacts: CanonicalFact[] = [];
    for (const fact of extractedFacts) {
      // Validate the fact structure
      if (!fact.category || !fact.name || !fact.fact) {
        log.warn('Skipping malformed fact', { fact });
        continue;
      }

      // Validate category
      const validCategories = ['character', 'place', 'event', 'object', 'relationship'];
      if (!validCategories.includes(fact.category)) {
        log.warn('Skipping fact with invalid category', { category: fact.category });
        continue;
      }

      try {
        const canonicalFact: CanonicalFact = {
          category: fact.category as CanonicalFact['category'],
          name: fact.name,
          fact: fact.fact,
          sourceSeeds: [page.seed],
        };

        const saved = await saveCanonicalFact(canonicalFact);
        savedFacts.push(saved);
      } catch (saveError) {
        log.error('Failed to save fact', {
          fact,
          error: saveError instanceof Error ? saveError.message : String(saveError),
        });
      }
    }

    log.info('Facts saved to database', {
      seed: page.seed,
      savedCount: savedFacts.length,
    });

    return savedFacts;
  } catch (error) {
    log.error('Fact extraction failed', {
      seed: page.seed,
      pageNumber: page.pageNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Get relevant canonical facts for generating a new page.
 * Uses same-book priority: facts from this book first, then cross-book facts via FTS.
 * This ensures a book never "forgets" its own established facts.
 */
export async function getRelevantFactsForGeneration(
  seed: string,
  existingPageContent?: string
): Promise<CanonicalFact[]> {
  log.info('Getting relevant facts for generation', {
    seed,
    hasExistingContent: !!existingPageContent,
  });

  // Use priority retrieval: same-book facts first, then cross-book via FTS
  const facts = await getRelevantFactsWithBookPriority(seed, 12);

  log.info('Relevant facts retrieved with book priority', {
    seed,
    totalFacts: facts.length,
    factNames: facts.map(f => f.name),
  });

  return facts;
}

/**
 * Schedule fact extraction to run asynchronously after page generation.
 * This prevents fact extraction from slowing down the page response.
 */
export function scheduleFactExtraction(page: Page): void {
  // Run extraction in the background, don't await
  setImmediate(async () => {
    try {
      await extractFactsFromPage(page);
    } catch (error) {
      log.error('Background fact extraction failed', {
        seed: page.seed,
        pageNumber: page.pageNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

