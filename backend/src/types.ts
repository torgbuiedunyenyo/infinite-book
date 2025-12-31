export interface Page {
  id?: number;
  seed: string;
  pageNumber: number;
  content: string;
  opening: string;
  closing: string;
  references: Reference[];
  discoveredAt?: Date;
}

export interface Reference {
  text: string;
  seed: string;
}

export interface CanonicalFact {
  id?: number;
  category: 'character' | 'place' | 'event' | 'object' | 'relationship';
  name: string;
  fact: string;
  sourceSeeds: string[];  // Which books established this fact
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== HIERARCHICAL SUMMARY SYSTEM ====================

/**
 * Book Narrative Arc: The story's DNA, created from page 1.
 * A rich 150-250 word document that guides all future page generation.
 * 
 * Replaces the old BookSynopsis which had 4 redundant representations of page 1.
 */
export interface BookArc {
  id?: number;
  seed: string;
  narrativeArc: string;      // 150-250 words: protagonist, tension, trajectory, themes, world connections
  narrativeMode: string;     // 'character', 'place', 'document', 'event', 'concept'
  createdAt?: Date;
}

/**
 * Running Summary: Current story momentum.
 * Created at page 5, updated at pages 10, 15, 20...
 * Tracks WHERE the story IS NOW, not its history.
 */
export interface RunningSummary {
  id?: number;
  seed: string;
  momentum: string;          // 75-125 words: current tensions, character positions, thematic direction
  lastUpdatedPage: number;
  updatedAt?: Date;
}

/**
 * Chunk Summary: Factual summary of a 5-page segment.
 * Created at chunk boundaries: pages 5, 10, 15, 20...
 * 
 * Replaces StoryEvent system which had a broken selection algorithm
 * that created gaps in story context (pages 4-7 were never represented).
 */
export interface ChunkSummary {
  id?: number;
  seed: string;
  chunkStart: number;        // First page of chunk (1, 6, 11, 16...)
  chunkEnd: number;          // Last page of chunk (5, 10, 15, 20...)
  summary: string;           // 75-125 words: key events, character developments, plot progressions
  createdAt?: Date;
}

// ==================== GENERATION CONTEXT ====================

export interface GenerationContext {
  seed: string;
  pageNumber: number;
  prevPages: Page[];                    // Now 3 pages (was 2) for expanded sliding window
  referrerContext?: {
    seed: string;
    pageNumber: number;
    content: string;
  };
  canonicalFacts?: CanonicalFact[];     // Relevant facts for world consistency
  bookArc?: BookArc;                    // Book's narrative DNA (pages > 1)
  runningSummary?: RunningSummary;      // Current story momentum (pages > 5)
  chunkSummaries?: ChunkSummary[];      // Story history in 5-page chunks
}

export interface GetOrGenerateResult {
  page: Page;
  isNewDiscovery: boolean;
}

// ==================== ACCESS CONTROL ERRORS ====================

/**
 * Thrown when a user tries to generate page N before page N-1 exists.
 * Pages must be discovered sequentially within a book.
 */
export class SequentialAccessError extends Error {
  constructor(public seed: string, public pageNumber: number) {
    super(`Cannot generate page ${pageNumber} of "${seed}" - page ${pageNumber - 1} does not exist yet`);
    this.name = 'SequentialAccessError';
  }
}

/**
 * Thrown when a user tries to create a new book (page 1 of an unknown seed)
 * without following a valid [[reference]] from an existing page.
 * New books can only be created by:
 * 1. Navigating to a canonical seed, OR
 * 2. Clicking a [[reference]] in an existing page
 */
export class InvalidSeedAccessError extends Error {
  constructor(public seed: string, public reason: string) {
    super(`Cannot create book "${seed}": ${reason}`);
    this.name = 'InvalidSeedAccessError';
  }
}
