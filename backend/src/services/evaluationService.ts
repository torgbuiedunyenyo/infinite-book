/**
 * Evaluation Service: Comprehensive quality assessment for generated pages.
 * 
 * Implements both discrete (programmatic) and qualitative (LLM-as-judge) evaluations
 * based on the narrative principles defined in templates.ts.
 * 
 * Evaluation Categories:
 * 1. DISCRETE: Fast, rule-based checks (references, word count, format)
 * 2. CRAFT: Show-don't-tell, prose quality, voice
 * 3. STRUCTURE: Forward momentum, tension, pacing
 * 4. WORLD: Temporal mechanics consistency, trope avoidance
 * 5. COHERENCE: Seed sovereignty, cross-book consistency
 */

import Anthropic from '@anthropic-ai/sdk';
import { Page } from '../types';
import { langfuse, isLangfuseEnabled, flushLangfuse } from './langfuse';
import { createLogger } from './logger';
import { WORLD_ESSENCE, NARRATIVE_CONTEXT } from '../prompts/templates';

const log = createLogger('evaluation');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Use Sonnet for evaluations (cost-effective, still high quality)
const EVAL_MODEL = 'claude-sonnet-4-5-20250929';

// ==================== TYPES ====================

interface EvaluationResult {
  score: number;       // 0-1 normalized score
  reasoning: string;   // Evaluator's explanation
  rawScore?: number;   // Original scale score (e.g., 1-5)
}

interface DiscreteEvaluation {
  name: string;
  description: string;
  evaluate: (content: string, metadata?: PageMetadata) => number | boolean;
  dataType: 'NUMERIC' | 'BOOLEAN';
}

interface QualitativeEvaluation {
  name: string;
  description: string;
  prompt: string;
  scoreScale: { min: number; max: number };
  category: 'craft' | 'structure' | 'world' | 'coherence';
}

interface PageMetadata {
  seed: string;
  pageNumber: number;
  isCoreSeed?: boolean;
  bookArc?: string;
  narrativeMode?: string;
}

// ==================== DISCRETE EVALUATIONS ====================
// Fast, programmatic checks that don't require LLM calls

export const DISCRETE_EVALUATIONS: Record<string, DiscreteEvaluation> = {
  
  // Reference checks
  hasReferences: {
    name: 'has_references',
    description: 'Whether the page contains at least one [[reference]]',
    dataType: 'BOOLEAN',
    evaluate: (content: string): boolean => {
      return /\[\[([^\]]+)\]\]/.test(content);
    }
  },
  
  referenceCount: {
    name: 'reference_count',
    description: 'Number of unique [[references]] on the page',
    dataType: 'NUMERIC',
    evaluate: (content: string): number => {
      const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
      const unique = new Set(matches.map(m => m.toLowerCase()));
      return unique.size;
    }
  },
  
  referenceInTargetRange: {
    name: 'references_in_target_range',
    description: 'Whether page has 1-2 references (target range)',
    dataType: 'BOOLEAN',
    evaluate: (content: string): boolean => {
      const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
      const unique = new Set(matches.map(m => m.toLowerCase()));
      return unique.size >= 1 && unique.size <= 2;
    }
  },

  // Word count checks
  wordCount: {
    name: 'word_count',
    description: 'Total word count of the page',
    dataType: 'NUMERIC',
    evaluate: (content: string): number => {
      return content.split(/\s+/).filter(w => w.length > 0).length;
    }
  },
  
  wordCountInTargetRange: {
    name: 'word_count_in_target_range',
    description: 'Whether word count is 200-300 (target range)',
    dataType: 'BOOLEAN',
    evaluate: (content: string): boolean => {
      const words = content.split(/\s+/).filter(w => w.length > 0).length;
      return words >= 200 && words <= 300;
    }
  },

  // Format checks
  noMetaCommentary: {
    name: 'no_meta_commentary',
    description: 'Whether page avoids headers, meta-text, or out-of-world commentary',
    dataType: 'BOOLEAN',
    evaluate: (content: string): boolean => {
      // Check for common meta-commentary patterns
      const metaPatterns = [
        /^#+\s/m,                           // Markdown headers
        /^Page \d+/im,                      // "Page X" headers
        /\[Note:/i,                         // Editorial notes
        /\[Author's note/i,                 // Author notes
        /\[End of/i,                        // End markers
        /\[To be continued/i,               // Continuation markers
        /---\s*$/m,                         // Horizontal rules at end
        /^\*\*\*/m,                         // Scene break markers
      ];
      return !metaPatterns.some(pattern => pattern.test(content));
    }
  },

  // Temporal trope detection (basic pattern matching)
  noObviousLoopLanguage: {
    name: 'no_obvious_loop_language',
    description: 'Whether page avoids explicit time loop language',
    dataType: 'BOOLEAN',
    evaluate: (content: string): boolean => {
      const loopPatterns = [
        /relive|reliving/i,
        /stuck in a loop/i,
        /same day (again|over)/i,
        /deja vu/i,
        /repeat(ing|ed)? (the )?(same|this)/i,
        /groundhog day/i,
      ];
      return !loopPatterns.some(pattern => pattern.test(content));
    }
  },

  noParadoxLanguage: {
    name: 'no_paradox_language',
    description: 'Whether page avoids explicit paradox language',
    dataType: 'BOOLEAN',
    evaluate: (content: string): boolean => {
      const paradoxPatterns = [
        /grandfather paradox/i,
        /bootstrap paradox/i,
        /causal loop/i,
        /created? (himself|herself|itself)/i,
        /own (birth|death|existence)/i,
        /erase(d)? from existence/i,
      ];
      return !paradoxPatterns.some(pattern => pattern.test(content));
    }
  },

  // Ending analysis
  endsWithPunctuation: {
    name: 'ends_with_punctuation',
    description: 'Whether page ends with sentence-ending punctuation',
    dataType: 'BOOLEAN',
    evaluate: (content: string): boolean => {
      const trimmed = content.trim();
      return /[.!?""']$/.test(trimmed);
    }
  },

  // Prose density (simple metric for telling vs showing)
  dialoguePresent: {
    name: 'dialogue_present',
    description: 'Whether page contains dialogue',
    dataType: 'BOOLEAN',
    evaluate: (content: string): boolean => {
      // Check for quoted speech patterns
      return /"[^"]+"|"[^"]+"|'[^']+'/.test(content);
    }
  },

  sentenceVariety: {
    name: 'sentence_variety',
    description: 'Standard deviation of sentence lengths (higher = more variety)',
    dataType: 'NUMERIC',
    evaluate: (content: string): number => {
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (sentences.length < 3) return 0;
      
      const lengths = sentences.map(s => s.trim().split(/\s+/).length);
      const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const variance = lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length;
      return Math.sqrt(variance);
    }
  },
};

// ==================== QUALITATIVE EVALUATIONS ====================
// LLM-as-judge evaluations for nuanced quality assessment

export const QUALITATIVE_EVALUATIONS: Record<string, QualitativeEvaluation> = {

  // ========== CRAFT: Show-don't-tell, prose quality ==========
  
  showDontTell: {
    name: 'show_dont_tell',
    description: 'Evaluates adherence to show-don\'t-tell narrative technique',
    category: 'craft',
    scoreScale: { min: 1, max: 5 },
    prompt: `You are evaluating a passage from an AI-generated fiction system for its use of "show-don't-tell."

In this world's narrative principles, show-don't-tell means:
- Characters LIVE in the world; they don't explain it to the reader
- A future person's confusion with a phone reveals neural interfaces WITHOUT naming "neural interfaces"
- Power dynamics are shown through action and deference, not stated directly
- "Fish don't talk about water" — characters don't lecture about mechanics of their own world
- World-specific terms appear naturally without definition

Examples from the principles:
- BAD: "The self-healing property of time means it had to already be here." (explaining mechanics)
- GOOD: "I left it here three days from now. Glad it's still here." (reader infers)

Rate this passage on a scale of 1-5:

1 = Heavy exposition: Mechanics are explained, emotions are stated ("he felt sad"), world rules are lectured
2 = Mostly telling: Some action, but frequent explanations or stated emotions
3 = Mixed: Some showing, some telling; world mechanics occasionally named unnecessarily
4 = Mostly showing: Actions reveal character/world; minimal necessary exposition
5 = Excellent showing: Immersive, inferential; reader discovers through scene, not explanation

<passage>
{{content}}
</passage>

Respond with JSON only:
{
  "score": <1-5>,
  "reasoning": "<2-3 sentences with specific examples from the passage>"
}`
  },

  proseImmersion: {
    name: 'prose_immersion',
    description: 'Evaluates sensory richness and immersive quality of prose',
    category: 'craft',
    scoreScale: { min: 1, max: 5 },
    prompt: `You are evaluating a passage of fiction for sensory immersion and prose quality.

Immersive prose:
- Engages multiple senses (not just visual)
- Uses specific, concrete details rather than abstractions
- Creates a sense of BEING in the scene
- Varies sentence rhythm and structure
- Avoids generic descriptions that could apply anywhere

Rate this passage on a scale of 1-5:

1 = Generic, abstract prose; could describe any scene; no sensory engagement
2 = Mostly generic with occasional specific details
3 = Adequate specificity; some sensory engagement
4 = Rich in sensory detail; creates atmosphere; varied prose rhythm
5 = Deeply immersive; vivid and specific; prose itself creates experience

<passage>
{{content}}
</passage>

Respond with JSON only:
{
  "score": <1-5>,
  "reasoning": "<2-3 sentences with specific examples from the passage>"
}`
  },

  // ========== STRUCTURE: Forward momentum, tension ==========

  forwardMomentum: {
    name: 'forward_momentum',
    description: 'Evaluates whether page pulls reader forward without resolving',
    category: 'structure',
    scoreScale: { min: 1, max: 5 },
    prompt: `You are evaluating a page of fiction for narrative momentum—does it pull readers forward?

This system's principles state:
- "Each page should pull the reader forward, not offer resolution"
- "End mid-beat. The page should feel incomplete."
- "Conflict develops; it doesn't resolve within a single page"
- "Never end on peaceful reflection or tidy summary"
- "Never write vignettes—isolated moments without forward momentum"

Signs of GOOD momentum:
- Unresolved tension or question
- Action interrupted or in progress
- Character about to do/discover/confront something
- Dialogue cut off or conversation unfinished
- Scene change that raises stakes

Signs of BAD momentum:
- Resolution or closure achieved
- Character reaches understanding or peace
- Summary of what happened
- Reflection on meaning
- Self-contained vignette that doesn't connect forward

Rate this passage on a scale of 1-5:

1 = Complete resolution; no reason to continue; vignette that closes on itself
2 = Mostly resolved; weak forward pull; ends on reflection
3 = Some momentum; partial resolution with minor hooks
4 = Strong momentum; clear unanswered tensions; ends mid-action
5 = Compelling incompleteness; reader urgently needs the next page

<passage>
{{content}}
</passage>

Respond with JSON only:
{
  "score": <1-5>,
  "reasoning": "<2-3 sentences explaining what creates or undermines momentum>"
}`
  },

  tensionPresence: {
    name: 'tension_presence',
    description: 'Evaluates presence and quality of narrative tension',
    category: 'structure',
    scoreScale: { min: 1, max: 5 },
    prompt: `You are evaluating a page of fiction for narrative tension.

Tension can be:
- Interpersonal: Conflict between characters, unspoken disagreements
- Situational: Danger, risk, urgency, stakes
- Internal: Character wrestling with a choice or realization
- Dramatic irony: Reader knows something character doesn't
- Structural: Something is wrong or doesn't add up

Rate this passage on a scale of 1-5:

1 = No tension; static scene; nothing at stake
2 = Minimal tension; situation is comfortable; low stakes
3 = Moderate tension; some conflict or stakes present
4 = Strong tension; multiple layers of conflict; something significant at stake
5 = Gripping tension; visceral stakes; conflict is palpable

<passage>
{{content}}
</passage>

Respond with JSON only:
{
  "score": <1-5>,
  "reasoning": "<2-3 sentences identifying what tension exists (or doesn't) in the passage>"
}`
  },

  // ========== WORLD: Temporal mechanics, trope avoidance ==========

  temporalMechanicsConsistency: {
    name: 'temporal_mechanics_consistency',
    description: 'Evaluates adherence to the world\'s unique temporal rules',
    category: 'world',
    scoreScale: { min: 1, max: 5 },
    prompt: `You are evaluating fiction for consistency with a specific world's temporal mechanics.

THE TRUE RULES (should be followed):
- Time has three dimensions: Primas (past/future), Phantas, Mystas
- Times exist independently—the past doesn't freeze when you leave; future already exists
- There is ONE of you in all time—no meeting yourself, no parallel selves
- Time is SELF-HEALING—disturbances fade with distance, no butterfly effects
- Travel takes time and effort; uses PRMTTs and maps
- Returning somewhere, you'll find it changed (time kept moving without you)
- Aging happens in all directions of travel

FALSE TROPES (should be ABSENT):
- Time loops / reliving the same day
- Meeting yourself / duplicate selves
- Butterfly effects / small changes cascading
- Paradoxes (grandfather paradox, bootstrap paradox)
- Mystical weirdness (flickering objects, eerie sensations, spooky music)
- Determinism / fate / "meant to happen"
- The present as special / more real

Rate adherence to these rules:

1 = Clear violations: Uses forbidden tropes (loops, paradoxes, meeting self, butterfly effects)
2 = Some inconsistencies: Minor trope usage or ambiguous mechanics
3 = Mostly consistent: No major violations; some vague areas
4 = Strong consistency: Respects mechanics; avoids all forbidden tropes
5 = Perfect adherence: Demonstrates understanding; mechanics feel natural and correct

<passage>
{{content}}
</passage>

Respond with JSON only:
{
  "score": <1-5>,
  "reasoning": "<2-3 sentences noting any temporal mechanics present and whether they're consistent>"
}`
  },

  noMysticalWeirdness: {
    name: 'no_mystical_weirdness',
    description: 'Evaluates whether time travel is treated as physics, not magic',
    category: 'world',
    scoreScale: { min: 1, max: 5 },
    prompt: `You are evaluating fiction to ensure time travel is treated as PHYSICS, not MAGIC.

The world rules explicitly state:
- "Time travel is not eerie, spooky, or metaphysically strange"
- "Objects don't flicker in and out of existence"
- "Music doesn't skip backward ominously"  
- "Handwriting doesn't appear from nowhere"
- "It's physics, not magic"

RED FLAGS (should be absent):
- Uncanny feelings or premonitions about time
- Objects appearing/disappearing mysteriously
- Eerie sensations when traveling
- Glitches, flickers, or visual distortions
- Fate, destiny, or "the universe wants"
- Mystical significance to times or places
- Horror-movie atmosphere around temporal events

ACCEPTABLE:
- Disorientation from travel (like jet lag)
- Practical confusion navigating
- Technology working/not working
- Physical fatigue from travel

Rate on a scale of 1-5:

1 = Heavy mystical elements: Spooky, eerie, magical treatment of time
2 = Some mystical creep: Occasional uncanny or fate-like elements
3 = Mostly grounded: Minor atmosphere issues
4 = Well grounded: Time travel feels practical/physical
5 = Perfectly grounded: Time is mundane physics; no mystical undertones

<passage>
{{content}}
</passage>

Respond with JSON only:
{
  "score": <1-5>,
  "reasoning": "<2-3 sentences noting any mystical elements present or their absence>"
}`
  },

  powerDynamicsRealism: {
    name: 'power_dynamics_realism',
    description: 'Evaluates realistic portrayal of future/past power imbalances',
    category: 'world',
    scoreScale: { min: 1, max: 5 },
    prompt: `You are evaluating fiction for realistic portrayal of cross-era power dynamics.

The world rules establish:
- Future people have structural power: wealth, technology, legal status, cultural fluency
- Past people lack these and may depend on future people to navigate
- Cross-era relationships attract suspicion (assumed transactional)
- Temporal prejudice exists: assumptions of desperation, backwardness, criminal tendencies
- Even kind future people benefit from and perpetuate the system
- The underground exists for undocumented past travelers

Signs of REALISTIC dynamics:
- Power imbalance acknowledged through behavior, not stated
- Small moments of condescension, assumption, or deference
- Practical challenges of navigating unfamiliar times
- Social suspicion shown through reactions
- Economic realities affect choices

Signs of UNREALISTIC dynamics:
- Power imbalance ignored or glossed over
- Everyone treats cross-era people equally with no friction
- No practical challenges to being in a different time
- Relationships across eras treated as normal/unremarkable
- Utopian or dystopian extremes without nuance

Rate on a scale of 1-5:

1 = Unrealistic: Power dynamics ignored or cartoonishly simple
2 = Somewhat unrealistic: Minimal acknowledgment of structural differences
3 = Adequate: Some realistic friction present
4 = Realistic: Power dynamics emerge naturally through action
5 = Deeply realistic: Nuanced, systemic power felt in small moments

<passage>
{{content}}
</passage>

Respond with JSON only:
{
  "score": <1-5>,
  "reasoning": "<2-3 sentences on how power dynamics are portrayed, if applicable>"
}`
  },

  // ========== COHERENCE: Voice, seed sovereignty ==========

  voiceConsistency: {
    name: 'voice_consistency',
    description: 'Evaluates whether the prose voice matches the seed/subject',
    category: 'coherence',
    scoreScale: { min: 1, max: 5 },
    prompt: `You are evaluating fiction for voice consistency with its subject matter.

The principles state:
- "Different books have different voices"
- "A book about Jay should feel different from a book about Tan's father"
- "A book framed as a document should read as that document"
- "A book about a place should immerse in sensory detail"
- "Seed sovereignty: the seed determines what this book is about"

Consider:
- Does the voice match what this book claims to be about?
- If it's about a person, is the voice appropriate to their perspective?
- If it's about a place, is it sensory and atmospheric?
- If it's a document, does it read like that type of document?
- Is the narrative mode (character/place/document/event/concept) consistent?

<seed>{{seed}}</seed>
<narrative_mode>{{narrativeMode}}</narrative_mode>

<passage>
{{content}}
</passage>

Rate voice consistency on a scale of 1-5:

1 = Mismatched: Voice doesn't fit the seed/subject at all
2 = Weak match: Voice is generic, not tailored to subject
3 = Adequate match: Voice is acceptable but not distinctive
4 = Good match: Voice clearly serves the subject matter
5 = Excellent match: Voice is perfectly suited; distinctive and appropriate

Respond with JSON only:
{
  "score": <1-5>,
  "reasoning": "<2-3 sentences on how well the voice matches the subject>"
}`
  },

  emotionalAuthenticity: {
    name: 'emotional_authenticity',
    description: 'Evaluates whether emotions feel earned and real',
    category: 'coherence',
    scoreScale: { min: 1, max: 5 },
    prompt: `You are evaluating fiction for emotional authenticity.

Authentic emotions:
- Are shown through behavior, not stated
- Feel proportional to the situation
- Contain complexity or contradiction
- Emerge from character and context
- Are specific, not generic

Inauthentic emotions:
- Are stated directly ("she felt devastated")
- Feel melodramatic or disproportionate
- Are simple and one-dimensional
- Are imposed without earning them
- Are generic (could be any character)

Rate emotional authenticity on a scale of 1-5:

1 = Inauthentic: Emotions stated, forced, or melodramatic
2 = Mostly inauthentic: Some earned moments, but largely imposed
3 = Mixed: Some authentic emotion, some that feels forced
4 = Mostly authentic: Emotions emerge naturally from situation
5 = Deeply authentic: Emotions feel specific, earned, and complex

<passage>
{{content}}
</passage>

Respond with JSON only:
{
  "score": <1-5>,
  "reasoning": "<2-3 sentences on the emotional quality of the passage>"
}`
  },

  referenceQuality: {
    name: 'reference_quality',
    description: 'Evaluates whether [[references]] emerge naturally and are evocative',
    category: 'coherence',
    scoreScale: { min: 1, max: 5 },
    prompt: `You are evaluating the quality of [[references]] in fiction.

References in this system:
- Point to other books in the same world
- Should "emerge naturally from the prose"
- Should be "specific and evocative"
- Are how readers "discover new corners of the world"

Good references:
- Feel like natural parts of the narrative
- Point to intriguing things readers would want to explore
- Are specific (not generic concepts)
- Connect to the world's unique elements
- Could seed an interesting book

Bad references:
- Feel shoehorned or forced
- Are generic (e.g., [[the city]], [[her past]])
- Don't connect to this world specifically
- Interrupt the prose flow
- Would make boring books

<passage>
{{content}}
</passage>

Rate reference quality on a scale of 1-5:

1 = Poor: References forced, generic, or absent when appropriate
2 = Weak: References present but don't add much
3 = Adequate: References functional but not compelling
4 = Good: References natural and point to interesting subjects
5 = Excellent: References feel organic and open fascinating doors

Respond with JSON only:
{
  "score": <1-5>,
  "reasoning": "<2-3 sentences on the quality and integration of references>"
}`
  },
};

// ==================== EVALUATION EXECUTION ====================

/**
 * Run a single LLM-based evaluation
 */
async function runLLMEvaluation(
  criteria: QualitativeEvaluation,
  content: string,
  metadata?: PageMetadata
): Promise<EvaluationResult> {
  // Replace template variables in prompt
  let prompt = criteria.prompt.replace('{{content}}', content);
  
  if (metadata?.seed) {
    prompt = prompt.replace('{{seed}}', metadata.seed);
  }
  if (metadata?.narrativeMode) {
    prompt = prompt.replace('{{narrativeMode}}', metadata.narrativeMode);
  } else {
    prompt = prompt.replace('{{narrativeMode}}', 'unknown');
  }

  const response = await anthropic.messages.create({
    model: EVAL_MODEL,
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' 
    ? response.content[0].text 
    : '';

  // Parse JSON response (handle markdown code blocks)
  let jsonText = text.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  try {
    const result = JSON.parse(jsonText);
    
    // Normalize score to 0-1 range
    const { min, max } = criteria.scoreScale;
    const normalizedScore = (result.score - min) / (max - min);

    return {
      score: normalizedScore,
      rawScore: result.score,
      reasoning: result.reasoning,
    };
  } catch (parseError) {
    log.error('Failed to parse evaluation response', {
      criteria: criteria.name,
      response: text.slice(0, 500),
      error: parseError instanceof Error ? parseError.message : String(parseError),
    });
    throw new Error(`Failed to parse ${criteria.name} evaluation response`);
  }
}

/**
 * Run all discrete evaluations and record scores to Langfuse
 */
export async function runDiscreteEvaluations(
  page: Page,
  traceId: string,
  metadata?: PageMetadata
): Promise<void> {
  if (!isLangfuseEnabled()) {
    log.debug('Langfuse disabled, skipping discrete evaluations');
    return;
  }

  log.info('Running discrete evaluations', {
    seed: page.seed,
    pageNumber: page.pageNumber,
    traceId,
  });

  for (const [key, evaluation] of Object.entries(DISCRETE_EVALUATIONS)) {
    try {
      const value = evaluation.evaluate(page.content, metadata);
      
      langfuse.score({
        traceId,
        name: evaluation.name,
        value: typeof value === 'boolean' ? (value ? 1 : 0) : value,
        dataType: evaluation.dataType,
        comment: evaluation.description,
      });

      log.debug(`Discrete eval: ${evaluation.name}`, {
        value,
        seed: page.seed,
        pageNumber: page.pageNumber,
      });
    } catch (error) {
      log.error(`Discrete evaluation failed: ${evaluation.name}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Run specified qualitative evaluations and record scores to Langfuse
 */
export async function runQualitativeEvaluations(
  page: Page,
  traceId: string,
  evaluationNames?: string[],
  metadata?: PageMetadata
): Promise<void> {
  if (!isLangfuseEnabled()) {
    log.debug('Langfuse disabled, skipping qualitative evaluations');
    return;
  }

  // Default to all evaluations if none specified
  const evaluationsToRun = evaluationNames 
    ? Object.entries(QUALITATIVE_EVALUATIONS).filter(([key]) => evaluationNames.includes(key))
    : Object.entries(QUALITATIVE_EVALUATIONS);

  log.info('Running qualitative evaluations', {
    seed: page.seed,
    pageNumber: page.pageNumber,
    traceId,
    evaluations: evaluationsToRun.map(([key]) => key),
  });

  for (const [key, criteria] of evaluationsToRun) {
    try {
      const result = await runLLMEvaluation(criteria, page.content, metadata);
      
      langfuse.score({
        traceId,
        name: criteria.name,
        value: result.score,
        dataType: 'NUMERIC',
        comment: result.reasoning,
      });

      log.info(`Qualitative eval: ${criteria.name}`, {
        rawScore: result.rawScore,
        normalizedScore: result.score.toFixed(2),
        reasoning: result.reasoning.slice(0, 100) + '...',
        seed: page.seed,
        pageNumber: page.pageNumber,
      });
    } catch (error) {
      log.error(`Qualitative evaluation failed: ${criteria.name}`, {
        seed: page.seed,
        pageNumber: page.pageNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Run full evaluation suite for a page
 * 
 * @param page - The page to evaluate
 * @param traceId - Langfuse trace ID to attach scores to
 * @param options - Configuration options
 */
export async function evaluatePage(
  page: Page,
  traceId: string,
  options: {
    discrete?: boolean;
    qualitative?: boolean | string[];
    metadata?: PageMetadata;
  } = {}
): Promise<void> {
  const { 
    discrete = true, 
    qualitative = true, 
    metadata 
  } = options;

  const pageMetadata: PageMetadata = metadata || {
    seed: page.seed,
    pageNumber: page.pageNumber,
  };

  log.info('Starting page evaluation', {
    seed: page.seed,
    pageNumber: page.pageNumber,
    traceId,
    runDiscrete: discrete,
    runQualitative: !!qualitative,
  });

  try {
    // Run discrete evaluations (fast, no LLM calls)
    if (discrete) {
      await runDiscreteEvaluations(page, traceId, pageMetadata);
    }

    // Run qualitative evaluations (LLM-based)
    if (qualitative) {
      const evalNames = Array.isArray(qualitative) ? qualitative : undefined;
      await runQualitativeEvaluations(page, traceId, evalNames, pageMetadata);
    }

    // Flush scores to Langfuse
    await flushLangfuse();

    log.info('Page evaluation complete', {
      seed: page.seed,
      pageNumber: page.pageNumber,
      traceId,
    });
  } catch (error) {
    log.error('Page evaluation failed', {
      seed: page.seed,
      pageNumber: page.pageNumber,
      traceId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Schedule evaluation to run in the background (non-blocking)
 */
export function scheduleEvaluation(
  page: Page,
  traceId: string,
  options?: {
    discrete?: boolean;
    qualitative?: boolean | string[];
    metadata?: PageMetadata;
  }
): void {
  if (!isLangfuseEnabled()) {
    return;
  }

  setImmediate(async () => {
    try {
      await evaluatePage(page, traceId, options);
    } catch (error) {
      log.error('Background evaluation failed', {
        seed: page.seed,
        pageNumber: page.pageNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

// ==================== EVALUATION STATS ====================

/**
 * Get summary of available evaluations
 */
export function getEvaluationStats(): {
  discrete: string[];
  qualitative: { name: string; category: string; description: string }[];
} {
  return {
    discrete: Object.entries(DISCRETE_EVALUATIONS).map(([key, e]) => `${e.name}: ${e.description}`),
    qualitative: Object.entries(QUALITATIVE_EVALUATIONS).map(([key, e]) => ({
      name: e.name,
      category: e.category,
      description: e.description,
    })),
  };
}

