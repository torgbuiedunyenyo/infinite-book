export interface Page {
  id?: number;
  seed: string;
  pageNumber: number;
  content: string;
  opening: string;
  closing: string;
  references: Reference[];
  citations: Citation[];  // Kept for backwards compatibility with existing database records
  discoveredAt?: Date;
}

export interface Reference {
  text: string;
  seed: string;
}

export interface Citation {
  id: number;
  url: string;
  title: string;
  snippet: string;
  publishedDate?: string;
  author?: string;
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

export interface BookSynopsis {
  id?: number;
  seed: string;
  synopsis: string;           // 2-3 sentence summary of what this book is about
  narrativeMode: string;      // 'character', 'place', 'document', 'event', 'concept'
  openingSituation: string;   // One sentence describing the scene on page 1
  createdAt?: Date;
}

export interface GenerationContext {
  seed: string;
  pageNumber: number;
  prevPages: Page[];
  nextPages: Page[];
  referrerContext?: {
    seed: string;
    pageNumber: number;
    content: string;
  };
  canonicalFacts?: CanonicalFact[];  // Relevant facts for consistency
  bookSynopsis?: BookSynopsis;       // Book-level context for narrative coherence
  page1Opening?: string;             // Opening of page 1 for anchoring
}

export interface NeighborPages {
  prev: Page[];
  next: Page[];
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
