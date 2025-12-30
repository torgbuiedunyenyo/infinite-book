import { Pool } from 'pg';
import { Page, Reference, Citation, NeighborPages, CanonicalFact, BookSynopsis } from '../types';
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
    citationsCount: Array.isArray(row.citations) ? row.citations.length : 0,
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
    citations: (row.citations as Citation[]) || [],
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
    `SELECT id, seed, page_number, content, opening, closing, "references", citations, discovered_at
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
    citationsCount: result.rows[0].citations?.length || 0,
    discoveredAt: result.rows[0].discovered_at,
  });
  
  return mapRowToPage(result.rows[0]);
}

export async function getNeighborPages(seed: string, pageNumber: number): Promise<NeighborPages> {
  log.info('getNeighborPages called', { seed, pageNumber });
  
  // Fetch up to 2 previous pages (N-2, N-1) and up to 2 next pages (N+1, N+2)
  const prevPageNumbers = [pageNumber - 2, pageNumber - 1].filter(n => n >= 1);
  const nextPageNumbers = [pageNumber + 1, pageNumber + 2];
  
  log.debug('Neighbor page ranges', {
    seed,
    targetPage: pageNumber,
    prevPageNumbers,
    nextPageNumbers,
  });

  const prevPromise = prevPageNumbers.length > 0
    ? executeQuery<any>(
        'getNeighborPages:prev',
        `SELECT id, seed, page_number, content, opening, closing, "references", citations, discovered_at
         FROM pages 
         WHERE seed = $1 AND page_number = ANY($2)
         ORDER BY page_number ASC`,
        [seed, prevPageNumbers]
      )
    : Promise.resolve({ rows: [], rowCount: 0, duration: 0 });

  const nextPromise = executeQuery<any>(
    'getNeighborPages:next',
    `SELECT id, seed, page_number, content, opening, closing, "references", citations, discovered_at
     FROM pages 
     WHERE seed = $1 AND page_number = ANY($2)
     ORDER BY page_number ASC`,
    [seed, nextPageNumbers]
  );

  const [prevResult, nextResult] = await Promise.all([prevPromise, nextPromise]);

  const neighbors = {
    prev: prevResult.rows.map(mapRowToPage),
    next: nextResult.rows.map(mapRowToPage),
  };
  
  log.info('Neighbor pages retrieved', {
    seed,
    pageNumber,
    prevPagesFound: neighbors.prev.map(p => p.pageNumber),
    nextPagesFound: neighbors.next.map(p => p.pageNumber),
    totalNeighbors: neighbors.prev.length + neighbors.next.length,
  });

  return neighbors;
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
    citationsCount: page.citations.length,
    references: page.references.map(r => r.text),
  });
  
  // Use ON CONFLICT to handle race conditions where multiple requests
  // try to save the same page simultaneously (e.g., prefetch vs streaming)
  const result = await executeQuery<{ id: number; discovered_at: Date }>(
    'savePage',
    `INSERT INTO pages (seed, page_number, content, opening, closing, "references", citations)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (seed, page_number) DO UPDATE SET seed = EXCLUDED.seed
     RETURNING id, discovered_at`,
    [
      page.seed,
      page.pageNumber,
      page.content,
      page.opening,
      page.closing,
      JSON.stringify(page.references),
      JSON.stringify(page.citations),
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
    citationsCount: savedPage.citations.length,
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
    narrativeMode: row.narrative_mode,
    openingSituation: row.opening_situation,
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
    `SELECT id, seed, synopsis, narrative_mode, opening_situation, created_at
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
