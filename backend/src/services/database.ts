import { Pool } from 'pg';
import { Page, Reference, NeighborPages } from '../types';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function mapRowToPage(row: any): Page {
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

export async function getPage(seed: string, pageNumber: number): Promise<Page | null> {
  const result = await pool.query(
    `SELECT id, seed, page_number, content, opening, closing, "references", discovered_at
     FROM pages 
     WHERE seed = $1 AND page_number = $2`,
    [seed, pageNumber]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToPage(result.rows[0]);
}

export async function getNeighborPages(seed: string, pageNumber: number): Promise<NeighborPages> {
  // Fetch up to 2 previous pages (N-2, N-1) and up to 2 next pages (N+1, N+2)
  const prevPageNumbers = [pageNumber - 2, pageNumber - 1].filter(n => n >= 1);
  const nextPageNumbers = [pageNumber + 1, pageNumber + 2];

  const prevPromise = prevPageNumbers.length > 0
    ? pool.query(
        `SELECT id, seed, page_number, content, opening, closing, "references", discovered_at
         FROM pages 
         WHERE seed = $1 AND page_number = ANY($2)
         ORDER BY page_number ASC`,
        [seed, prevPageNumbers]
      )
    : Promise.resolve({ rows: [] });

  const nextPromise = pool.query(
    `SELECT id, seed, page_number, content, opening, closing, "references", discovered_at
     FROM pages 
     WHERE seed = $1 AND page_number = ANY($2)
     ORDER BY page_number ASC`,
    [seed, nextPageNumbers]
  );

  const [prevResult, nextResult] = await Promise.all([prevPromise, nextPromise]);

  return {
    prev: prevResult.rows.map(mapRowToPage),
    next: nextResult.rows.map(mapRowToPage),
  };
}

export async function savePage(page: Page): Promise<Page> {
  // Use ON CONFLICT to handle race conditions where multiple requests
  // try to save the same page simultaneously (e.g., prefetch vs streaming)
  const result = await pool.query(
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

  return {
    ...page,
    id: result.rows[0].id,
    discoveredAt: result.rows[0].discovered_at,
  };
}

export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}
