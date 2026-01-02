/**
 * Facts Service: Extracts and retrieves canonical facts for world consistency.
 * 
 * Updated to use:
 * - Opus 4.5 (instead of Sonnet) for better extraction quality
 * - Full EXTRACTION_SYSTEM prompt with world context to prevent misinterpretation
 *   (e.g., the old "Jay is son of Tan" error)
 */

import Anthropic from '@anthropic-ai/sdk';
import { CanonicalFact, Page } from '../types';
import { saveCanonicalFact, getFactsByPriority, getFactsFromSeed, searchFacts } from './database';
import { EXTRACTION_SYSTEM, CORE_NARRATIVE_SEED } from '../prompts/templates';
import { factsLogger } from './logger';

const log = factsLogger;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Use Opus 4.5 for fact extraction - quality over cost/latency
// This prevents misinterpretation errors (e.g., "Jay is son of Tan")
const MODEL = 'claude-opus-4-5-20251101';
const THINKING_BUDGET = 8000;

/**
 * Extract canonical facts from a newly generated page.
 * 
 * Now uses:
 * - Full world context (EXTRACTION_SYSTEM) to correctly interpret relationships
 * - Opus 4.5 with extended thinking for better quality
 * - Explicit ground truths about Jay/Tan relationship
 */
export async function extractFactsFromPage(page: Page): Promise<CanonicalFact[]> {
  log.info('Extracting facts from page', {
    seed: page.seed,
    pageNumber: page.pageNumber,
    contentLength: page.content.length,
  });

  const prompt = `${EXTRACTION_SYSTEM}

<task>
Extract concrete facts from this page of fiction. These facts will be used to maintain consistency across other books in the same world.

CRITICAL - use the world knowledge above to interpret correctly:
- Jay and Tan are ROMANTIC PARTNERS, not relatives
- Power dynamics between eras may look like other relationships but aren't
- Deference or authority doesn't imply family relationships
- Characters from different eras have different social positions, not family ties

Extract facts that are:
- Concrete and specific (not vague descriptions)
- About named entities (characters, places, objects)
- Consistent with the world described above
- Establishable details that should remain consistent

Do NOT extract:
- Mood, atmosphere, or tone
- Vague descriptions
- Opinions or subjective judgments
- Things that are only implied or speculated
- Facts that contradict the ground truths above

<page seed="${page.seed}" page_number="${page.pageNumber}">
${page.content}
</page>
</task>

<output_format>
Return a JSON array of facts. Each fact should have:
- category: one of "character", "place", "event", "object", "relationship"
- name: the entity this fact is about (use consistent naming)
- fact: a single, specific fact (one sentence)
- priority: importance level (3=core narrative facts about Jay/Tan/key events, 2=major world elements like PRMTT companies/temporal mechanics/the edges/underground networks, 1=all other facts)

Example:
[
  {"category": "character", "name": "Jay", "fact": "Works at a shop in Oakland that sells clef to tourists.", "priority": 3},
  {"category": "place", "name": "The shop", "fact": "Located on a corner in Oakland, open late.", "priority": 2},
  {"category": "relationship", "name": "Jay and Tan", "fact": "Are romantic partners who met when Tan couldn't use Jay's phone.", "priority": 3}
]

If no concrete facts can be extracted, return an empty array: []

Return ONLY the JSON array, no other text.
</output_format>`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,  // Must be greater than THINKING_BUDGET (8000)
      thinking: {
        type: 'enabled',
        budget_tokens: THINKING_BUDGET,
      },
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      log.warn('No text in fact extraction response');
      return [];
    }

    // Parse the JSON response (strip markdown code blocks if present)
    let extractedFacts: Array<{ category: string; name: string; fact: string; priority?: number }>;
    try {
      let jsonText = textBlock.text.trim();
      // Strip markdown code block wrapper if present
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
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
          priority: fact.priority ?? 1,  // Default to lowest priority if not specified
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
 * Uses priority-based retrieval:
 * 1. Core narrative facts (priority 3) - ALWAYS included
 * 2. Same-book facts - for narrative consistency
 * 3. Cross-book facts via FTS - for world consistency
 *
 * For core narrative generation: filters out facts that ONLY come from inset narratives
 * to prevent subplot drift from inset world-building.
 */
export async function getRelevantFactsForGeneration(seed: string): Promise<CanonicalFact[]> {
  log.info('Getting relevant facts for generation', { seed });

  const isCoreSeed = seed === CORE_NARRATIVE_SEED;

  // 1. Always include high-priority facts (core narrative)
  let coreFacts = await getFactsByPriority(3, 4);
  log.debug('Core facts retrieved', { count: coreFacts.length });

  // 2. Get same-book facts
  const sameBookFacts = await getFactsFromSeed(seed, 4);
  log.debug('Same-book facts retrieved', { count: sameBookFacts.length });

  // 3. Get relevant cross-book facts via FTS (remaining slots)
  const remainingSlots = Math.max(0, 12 - coreFacts.length - sameBookFacts.length);
  let relatedFacts = remainingSlots > 0 ? await searchFacts(seed, remainingSlots) : [];
  log.debug('Related facts retrieved', { count: relatedFacts.length });

  // For core narrative: filter out facts that ONLY come from inset narratives
  // These can create subplot drift by injecting inset world-building into the main story
  if (isCoreSeed) {
    const beforeFilter = coreFacts.length + relatedFacts.length;

    coreFacts = coreFacts.filter(f =>
      f.sourceSeeds.includes(CORE_NARRATIVE_SEED)
    );
    relatedFacts = relatedFacts.filter(f =>
      f.sourceSeeds.includes(CORE_NARRATIVE_SEED)
    );

    log.info('Filtered inset-only facts for core narrative', {
      beforeFilter,
      afterFilter: coreFacts.length + relatedFacts.length,
    });
  }

  // Combine and dedupe
  const allFacts = [...coreFacts, ...sameBookFacts, ...relatedFacts];
  const seen = new Set<string>();
  const dedupedFacts = allFacts.filter(f => {
    const key = `${f.category}:${f.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  log.info('Facts assembled for generation', {
    seed,
    coreCount: coreFacts.length,
    sameBookCount: sameBookFacts.length,
    relatedCount: relatedFacts.length,
    totalAfterDedup: dedupedFacts.length,
  });

  return dedupedFacts.slice(0, 12);
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
