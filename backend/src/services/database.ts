import { Pool } from 'pg';
import { Page, Reference, CanonicalFact, BookSynopsis, StoryEvent } from '../types';
import { dbLogger } from './logger';

const log = dbLogger;

// Track connection pool stats
let queryCount = 0;
let totalQueryTime = 0;

log.info('Initializing database connection pool', {
  connectionString: process.env.DATABASE_URL ? '[REDACTED]' : 'NOT SET',
  ssl: 'rejectUnauthorized: false',
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Log pool events
pool.on('connect', () => {
  log.debug('New client connected to pool', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

pool.on('acquire', () => {
  log.debug('Client acquired from pool', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

pool.on('release', () => {
  log.debug('Client released back to pool', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

pool.on('error', (err: Error) => {
  log.error('Unexpected error on idle client', {
    error: err.message,
    stack: err.stack,
  });
});

function mapRowToPage(row: any): Page {
  log.debug('Mapping database row to Page object', {
    id: row.id,
    seed: row.seed,
    pageNumber: row.page_number,
    contentLength: row.content?.length,
    referencesCount: Array.isArray(row.references) ? row.references.length : 0,
    discoveredAt: row.discovered_at,
  });
  
  return {
    id: row.id,
    seed: row.seed,
    pageNumber: row.page_number,
    content: row.content,
    opening: row.opening,
    closing: row.closing,
    references: row.references as Reference[],
    discoveredAt: row.discovered_at,
  };
}

async function executeQuery<T>(
  queryName: string,
  query: string,
  params: unknown[]
): Promise<{ rows: T[]; rowCount: number; duration: number }> {
  const queryId = ++queryCount;
  const startTime = performance.now();
  
  log.debug(`Query #${queryId} starting: ${queryName}`, {
    query: query.replace(/\s+/g, ' ').trim(),
    params: params.map((p, i) => ({ [`$${i + 1}`]: typeof p === 'string' && p.length > 100 ? `[${p.length} chars]` : p })),
  });
  
  try {
    const result = await pool.query(query, params);
    const duration = performance.now() - startTime;
    totalQueryTime += duration;
    
    log.debug(`Query #${queryId} completed: ${queryName}`, {
      duration: `${duration.toFixed(2)}ms`,
      rowCount: result.rowCount,
      avgQueryTime: `${(totalQueryTime / queryCount).toFixed(2)}ms`,
    });
    
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount ?? 0,
      duration,
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    log.error(`Query #${queryId} failed: ${queryName}`, {
      duration: `${duration.toFixed(2)}ms`,
      error: error instanceof Error ? error.message : String(error),
      query: query.replace(/\s+/g, ' ').trim(),
    });
    throw error;
  }
}

export async function getPage(seed: string, pageNumber: number): Promise<Page | null> {
  log.info('getPage called', { seed, pageNumber });
  
  const result = await executeQuery<any>(
    'getPage',
    `SELECT id, seed, page_number, content, opening, closing, "references", discovered_at
     FROM pages 
     WHERE seed = $1 AND page_number = $2`,
    [seed, pageNumber]
  );

  if (result.rows.length === 0) {
    log.info('Page not found in database (will need generation)', { seed, pageNumber });
    return null;
  }

  log.info('Page found in database', {
    seed,
    pageNumber,
    id: result.rows[0].id,
    contentLength: result.rows[0].content?.length,
    discoveredAt: result.rows[0].discovered_at,
  });
  
  return mapRowToPage(result.rows[0]);
}

export async function getPreviousPages(seed: string, pageNumber: number): Promise<Page[]> {
  log.info('getPreviousPages called', { seed, pageNumber });
  
  // Fetch up to 2 previous pages (N-2, N-1)
  const prevPageNumbers = [pageNumber - 2, pageNumber - 1].filter(n => n >= 1);
  
  if (prevPageNumbers.length === 0) {
    log.debug('No previous pages to fetch (page 1)', { seed, pageNumber });
    return [];
  }
  
  log.debug('Previous page numbers to fetch', {
    seed,
    targetPage: pageNumber,
    prevPageNumbers,
  });

  const result = await executeQuery<any>(
    'getPreviousPages',
    `SELECT id, seed, page_number, content, opening, closing, "references", discovered_at
     FROM pages 
     WHERE seed = $1 AND page_number = ANY($2)
     ORDER BY page_number ASC`,
    [seed, prevPageNumbers]
  );

  const pages = result.rows.map(mapRowToPage);
  
  log.info('Previous pages retrieved', {
    seed,
    pageNumber,
    prevPagesFound: pages.map(p => p.pageNumber),
  });

  return pages;
}

export async function savePage(page: Page): Promise<Page> {
  log.separator(`SAVING NEW PAGE: "${page.seed}" p.${page.pageNumber}`);
  
  log.info('savePage called', {
    seed: page.seed,
    pageNumber: page.pageNumber,
    contentLength: page.content.length,
    openingLength: page.opening.length,
    closingLength: page.closing.length,
    referencesCount: page.references.length,
    references: page.references.map(r => r.text),
  });
  
  // Use ON CONFLICT to handle race conditions where multiple requests
  // try to save the same page simultaneously (e.g., prefetch vs streaming)
  const result = await executeQuery<{ id: number; discovered_at: Date }>(
    'savePage',
    `INSERT INTO pages (seed, page_number, content, opening, closing, "references")
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (seed, page_number) DO UPDATE SET seed = EXCLUDED.seed
     RETURNING id, discovered_at`,
    [
      page.seed,
      page.pageNumber,
      page.content,
      page.opening,
      page.closing,
      JSON.stringify(page.references),
    ]
  );

  const savedPage = {
    ...page,
    id: result.rows[0].id,
    discoveredAt: result.rows[0].discovered_at,
  };
  
  log.info('Page saved successfully', {
    id: savedPage.id,
    seed: savedPage.seed,
    pageNumber: savedPage.pageNumber,
    discoveredAt: savedPage.discoveredAt,
    contentPreview: savedPage.content.slice(0, 100) + '...',
  });

  return savedPage;
}

export async function checkConnection(): Promise<boolean> {
  log.info('Checking database connection...');
  
  try {
    const startTime = performance.now();
    await pool.query('SELECT 1');
    const duration = performance.now() - startTime;
    
    log.info('Database connection successful', {
      duration: `${duration.toFixed(2)}ms`,
      poolStats: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      },
    });
    return true;
  } catch (error) {
    log.error('Database connection failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return false;
  }
}

// Export pool stats for monitoring
export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    queryCount,
    totalQueryTime: `${totalQueryTime.toFixed(2)}ms`,
    avgQueryTime: queryCount > 0 ? `${(totalQueryTime / queryCount).toFixed(2)}ms` : '0ms',
  };
}

// Interface for discovered book summary
export interface DiscoveredBook {
  seed: string;
  pageCount: number;
  firstDiscoveredAt: Date;
  lastDiscoveredAt: Date;
}

// Get all discovered books (unique seeds with metadata)
export async function getAllBooks(): Promise<DiscoveredBook[]> {
  log.info('getAllBooks called');
  
  const result = await executeQuery<{
    seed: string;
    page_count: string;
    first_discovered_at: Date;
    last_discovered_at: Date;
  }>(
    'getAllBooks',
    `SELECT 
       seed,
       COUNT(*) as page_count,
       MIN(discovered_at) as first_discovered_at,
       MAX(discovered_at) as last_discovered_at
     FROM pages 
     GROUP BY seed 
     ORDER BY last_discovered_at DESC`,
    []
  );
  
  const books = result.rows.map(row => ({
    seed: row.seed,
    pageCount: parseInt(row.page_count, 10),
    firstDiscoveredAt: row.first_discovered_at,
    lastDiscoveredAt: row.last_discovered_at,
  }));
  
  log.info('Retrieved all discovered books', {
    totalBooks: books.length,
    totalPages: books.reduce((sum, b) => sum + b.pageCount, 0),
  });
  
  return books;
}

// ==================== CANONICAL FACTS ====================

function mapRowToFact(row: any): CanonicalFact {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    fact: row.fact,
    sourceSeeds: row.source_seeds || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Save or update a canonical fact
export async function saveCanonicalFact(fact: CanonicalFact): Promise<CanonicalFact> {
  log.info('saveCanonicalFact called', {
    category: fact.category,
    name: fact.name,
    factLength: fact.fact.length,
    sourceSeeds: fact.sourceSeeds,
  });
  
  const result = await executeQuery<any>(
    'saveCanonicalFact',
    `INSERT INTO canonical_facts (category, name, fact, source_seeds)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (category, name) DO UPDATE SET
       fact = EXCLUDED.fact,
       source_seeds = (
         SELECT jsonb_agg(DISTINCT value)
         FROM jsonb_array_elements(canonical_facts.source_seeds || EXCLUDED.source_seeds)
       ),
       updated_at = NOW()
     RETURNING id, category, name, fact, source_seeds, created_at, updated_at`,
    [fact.category, fact.name, fact.fact, JSON.stringify(fact.sourceSeeds)]
  );
  
  const savedFact = mapRowToFact(result.rows[0]);
  
  log.info('Canonical fact saved', {
    id: savedFact.id,
    category: savedFact.category,
    name: savedFact.name,
  });
  
  return savedFact;
}

// Get all facts (with optional category filter)
export async function getCanonicalFacts(category?: string): Promise<CanonicalFact[]> {
  log.info('getCanonicalFacts called', { category });
  
  let query = `SELECT id, category, name, fact, source_seeds, created_at, updated_at
               FROM canonical_facts`;
  const params: unknown[] = [];
  
  if (category) {
    query += ` WHERE category = $1`;
    params.push(category);
  }
  
  query += ` ORDER BY name ASC`;
  
  const result = await executeQuery<any>('getCanonicalFacts', query, params);
  
  const facts = result.rows.map(mapRowToFact);
  
  log.info('Retrieved canonical facts', {
    count: facts.length,
    category: category || 'all',
  });
  
  return facts;
}

// Search facts by relevance to a seed (full-text search)
export async function searchRelevantFacts(seed: string, limit: number = 10): Promise<CanonicalFact[]> {
  log.info('searchRelevantFacts called', { seed, limit });
  
  // Extract meaningful words from seed for search
  const searchTerms = seed
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2)
    .slice(0, 5)
    .join(' | ');
  
  if (!searchTerms) {
    log.debug('No valid search terms extracted from seed');
    return [];
  }
  
  const result = await executeQuery<any>(
    'searchRelevantFacts',
    `SELECT id, category, name, fact, source_seeds, created_at, updated_at,
            ts_rank(to_tsvector('english', name || ' ' || fact), to_tsquery('english', $1)) as rank
     FROM canonical_facts
     WHERE to_tsvector('english', name || ' ' || fact) @@ to_tsquery('english', $1)
     ORDER BY rank DESC
     LIMIT $2`,
    [searchTerms, limit]
  );
  
  const facts = result.rows.map(mapRowToFact);
  
  log.info('Relevant facts found', {
    seed,
    searchTerms,
    count: facts.length,
    factNames: facts.map(f => f.name),
  });
  
  return facts;
}

// Get facts by specific names (for known character/place references)
export async function getFactsByNames(names: string[]): Promise<CanonicalFact[]> {
  if (names.length === 0) return [];
  
  log.info('getFactsByNames called', { names });
  
  const result = await executeQuery<any>(
    'getFactsByNames',
    `SELECT id, category, name, fact, source_seeds, created_at, updated_at
     FROM canonical_facts
     WHERE LOWER(name) = ANY($1)
     ORDER BY name ASC`,
    [names.map(n => n.toLowerCase())]
  );
  
  const facts = result.rows.map(mapRowToFact);
  
  log.info('Facts retrieved by names', {
    requestedNames: names,
    foundCount: facts.length,
  });
  
  return facts;
}

// ==================== BOOK SYNOPSES ====================

function mapRowToSynopsis(row: any): BookSynopsis {
  return {
    id: row.id,
    seed: row.seed,
    synopsis: row.synopsis,
    updatedSynopsis: row.updated_synopsis,
    narrativeMode: row.narrative_mode,
    openingSituation: row.opening_situation,
    lastUpdatedPage: row.last_updated_page,
    createdAt: row.created_at,
  };
}

// Save a book synopsis (generated from page 1)
export async function saveBookSynopsis(synopsis: BookSynopsis): Promise<BookSynopsis> {
  log.info('saveBookSynopsis called', {
    seed: synopsis.seed,
    narrativeMode: synopsis.narrativeMode,
    synopsisLength: synopsis.synopsis.length,
  });
  
  const result = await executeQuery<any>(
    'saveBookSynopsis',
    `INSERT INTO book_synopses (seed, synopsis, narrative_mode, opening_situation)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (seed) DO UPDATE SET
       synopsis = EXCLUDED.synopsis,
       narrative_mode = EXCLUDED.narrative_mode,
       opening_situation = EXCLUDED.opening_situation
     RETURNING id, seed, synopsis, narrative_mode, opening_situation, created_at`,
    [synopsis.seed, synopsis.synopsis, synopsis.narrativeMode, synopsis.openingSituation]
  );
  
  const savedSynopsis = mapRowToSynopsis(result.rows[0]);
  
  log.info('Book synopsis saved', {
    id: savedSynopsis.id,
    seed: savedSynopsis.seed,
    narrativeMode: savedSynopsis.narrativeMode,
  });
  
  return savedSynopsis;
}

// Get a book synopsis by seed
export async function getBookSynopsis(seed: string): Promise<BookSynopsis | null> {
  log.debug('getBookSynopsis called', { seed });
  
  const result = await executeQuery<any>(
    'getBookSynopsis',
    `SELECT id, seed, synopsis, updated_synopsis, narrative_mode, opening_situation, last_updated_page, created_at
     FROM book_synopses WHERE seed = $1`,
    [seed]
  );
  
  if (result.rows.length === 0) {
    log.debug('Book synopsis not found', { seed });
    return null;
  }
  
  const synopsis = mapRowToSynopsis(result.rows[0]);
  
  log.debug('Book synopsis retrieved', {
    seed,
    narrativeMode: synopsis.narrativeMode,
    hasUpdatedSynopsis: !!synopsis.updatedSynopsis,
  });
  
  return synopsis;
}

// Get page 1's opening text for narrative anchoring
export async function getPage1Opening(seed: string): Promise<string | null> {
  log.debug('getPage1Opening called', { seed });
  
  const result = await executeQuery<{ opening: string }>(
    'getPage1Opening',
    `SELECT opening FROM pages WHERE seed = $1 AND page_number = 1`,
    [seed]
  );
  
  if (result.rows.length === 0) {
    log.debug('Page 1 opening not found', { seed });
    return null;
  }
  
  log.debug('Page 1 opening retrieved', {
    seed,
    openingLength: result.rows[0].opening.length,
  });
  
  return result.rows[0].opening;
}

// ==================== NAVIGATION ACCESS CONTROL ====================

/**
 * Get the highest page number that exists for a given seed.
 * Returns null if no pages exist for this seed.
 */
export async function getHighestPageNumber(seed: string): Promise<number | null> {
  log.debug('getHighestPageNumber called', { seed });
  
  const result = await executeQuery<{ highest: number | null }>(
    'getHighestPageNumber',
    `SELECT MAX(page_number) as highest FROM pages WHERE seed = $1`,
    [seed]
  );
  
  const highest = result.rows[0]?.highest;
  
  log.debug('Highest page number retrieved', {
    seed,
    highest: highest ?? 'none',
  });
  
  return highest ?? null;
}

// ==================== STORY EVENTS ====================

function mapRowToEvent(row: any): StoryEvent {
  return {
    id: row.id,
    seed: row.seed,
    pageNumber: row.page_number,
    event: row.event,
    significance: row.significance,
    entities: row.entities || [],
    createdAt: row.created_at,
  };
}

// Save a story event (extracted from a page)
export async function saveStoryEvent(event: StoryEvent): Promise<StoryEvent> {
  log.info('saveStoryEvent called', {
    seed: event.seed,
    pageNumber: event.pageNumber,
    significance: event.significance,
  });

  const result = await executeQuery<any>(
    'saveStoryEvent',
    `INSERT INTO story_events (seed, page_number, event, significance, entities)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (seed, page_number, event) DO UPDATE SET
       significance = EXCLUDED.significance,
       entities = EXCLUDED.entities
     RETURNING id, seed, page_number, event, significance, entities, created_at`,
    [event.seed, event.pageNumber, event.event, event.significance, JSON.stringify(event.entities)]
  );

  const savedEvent = mapRowToEvent(result.rows[0]);

  log.info('Story event saved', {
    id: savedEvent.id,
    seed: savedEvent.seed,
    pageNumber: savedEvent.pageNumber,
    significance: savedEvent.significance,
  });

  return savedEvent;
}

/**
 * Get story events for a book with weighted selection:
 * - Recent events (last 4 pages) are always included
 * - Key events from earlier pages fill remaining slots
 * This prevents repetition while preserving important early plot beats.
 */
export async function getBookEventsWeighted(
  seed: string,
  beforePage: number,
  limit: number = 10
): Promise<StoryEvent[]> {
  log.info('getBookEventsWeighted called', { seed, beforePage, limit });

  // Two-stage retrieval: recent events + key events from earlier
  const recentLimit = Math.min(4, limit);
  const keyLimit = limit - recentLimit;

  const result = await executeQuery<any>(
    'getBookEventsWeighted',
    `WITH recent AS (
        SELECT *, 1 as priority FROM story_events 
        WHERE seed = $1 AND page_number < $2
        ORDER BY page_number DESC 
        LIMIT $3
    ),
    key_events AS (
        SELECT *, 2 as priority FROM story_events 
        WHERE seed = $1 AND page_number < $2 
        AND significance = 'key'
        AND id NOT IN (SELECT id FROM recent)
        ORDER BY page_number ASC
        LIMIT $4
    )
    SELECT * FROM (
        SELECT * FROM recent
        UNION ALL
        SELECT * FROM key_events
    ) combined
    ORDER BY page_number ASC`,
    [seed, beforePage, recentLimit, keyLimit]
  );

  const events = result.rows.map(mapRowToEvent);

  log.info('Book events retrieved (weighted)', {
    seed,
    beforePage,
    totalEvents: events.length,
    recentCount: events.filter(e => e.pageNumber >= beforePage - 4).length,
    keyCount: events.filter(e => e.significance === 'key').length,
  });

  return events;
}

// ==================== SAME-BOOK FACT PRIORITY ====================

/**
 * Get relevant facts with same-book priority:
 * - First retrieves facts established by this book (up to half the limit)
 * - Then fills remaining slots with cross-book facts via FTS
 * This ensures a book never "forgets" its own established facts.
 */
export async function getRelevantFactsWithBookPriority(
  seed: string,
  limit: number = 12
): Promise<CanonicalFact[]> {
  log.info('getRelevantFactsWithBookPriority called', { seed, limit });

  const sameBookLimit = Math.ceil(limit / 2);  // Up to 6 for same-book

  // Stage 1: Facts from this book
  const sameBookResult = await executeQuery<any>(
    'getSameBookFacts',
    `SELECT id, category, name, fact, source_seeds, created_at, updated_at
     FROM canonical_facts
     WHERE source_seeds @> $1::jsonb
     ORDER BY updated_at DESC
     LIMIT $2`,
    [JSON.stringify([seed]), sameBookLimit]
  );

  const sameBookFacts = sameBookResult.rows.map(mapRowToFact);
  const sameBookIds = sameBookFacts.map(f => f.id);
  const remainingSlots = limit - sameBookFacts.length;

  log.debug('Same-book facts retrieved', {
    seed,
    count: sameBookFacts.length,
  });

  if (remainingSlots <= 0) {
    return sameBookFacts;
  }

  // Stage 2: Cross-book facts via FTS
  const searchTerms = seed
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2)
    .slice(0, 5)
    .join(' | ');

  if (!searchTerms) {
    return sameBookFacts;
  }

  let crossBookFacts: CanonicalFact[] = [];

  if (sameBookIds.length > 0) {
    const crossBookResult = await executeQuery<any>(
      'getCrossBookFacts',
      `SELECT id, category, name, fact, source_seeds, created_at, updated_at,
              ts_rank(to_tsvector('english', name || ' ' || fact), to_tsquery('english', $1)) as rank
       FROM canonical_facts
       WHERE to_tsvector('english', name || ' ' || fact) @@ to_tsquery('english', $1)
       AND id != ALL($3)
       ORDER BY rank DESC
       LIMIT $2`,
      [searchTerms, remainingSlots, sameBookIds]
    );
    crossBookFacts = crossBookResult.rows.map(mapRowToFact);
  } else {
    const crossBookResult = await executeQuery<any>(
      'getCrossBookFacts',
      `SELECT id, category, name, fact, source_seeds, created_at, updated_at,
              ts_rank(to_tsvector('english', name || ' ' || fact), to_tsquery('english', $1)) as rank
       FROM canonical_facts
       WHERE to_tsvector('english', name || ' ' || fact) @@ to_tsquery('english', $1)
       ORDER BY rank DESC
       LIMIT $2`,
      [searchTerms, remainingSlots]
    );
    crossBookFacts = crossBookResult.rows.map(mapRowToFact);
  }

  log.info('Facts retrieved with book priority', {
    seed,
    sameBookCount: sameBookFacts.length,
    crossBookCount: crossBookFacts.length,
  });

  return [...sameBookFacts, ...crossBookFacts];
}

// ==================== SYNOPSIS UPDATES ====================

/**
 * Update a book's synopsis to reflect current story state.
 * Called every 5 pages to keep synopsis current.
 */
export async function updateSynopsisInDb(
  seed: string,
  updatedSynopsis: string,
  lastUpdatedPage: number
): Promise<void> {
  log.info('updateSynopsisInDb called', { seed, lastUpdatedPage });

  await executeQuery(
    'updateSynopsis',
    `UPDATE book_synopses 
     SET updated_synopsis = $2, last_updated_page = $3
     WHERE seed = $1`,
    [seed, updatedSynopsis, lastUpdatedPage]
  );

  log.info('Synopsis updated in database', { seed, lastUpdatedPage });
}
