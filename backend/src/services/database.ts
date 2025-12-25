import { Pool } from 'pg';
import { Page, Reference, NeighborPages } from '../types';
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
        `SELECT id, seed, page_number, content, opening, closing, "references", discovered_at
         FROM pages 
         WHERE seed = $1 AND page_number = ANY($2)
         ORDER BY page_number ASC`,
        [seed, prevPageNumbers]
      )
    : Promise.resolve({ rows: [], rowCount: 0, duration: 0 });

  const nextPromise = executeQuery<any>(
    'getNeighborPages:next',
    `SELECT id, seed, page_number, content, opening, closing, "references", discovered_at
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
