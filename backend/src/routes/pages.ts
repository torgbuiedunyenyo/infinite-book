import { Router, Request, Response } from 'express';
import { getOrGeneratePage, streamOrGetPage, ReferrerContext, getGeneratorStats } from '../services/pageGenerator';
import { getPage, getPoolStats, getAllBooks } from '../services/database';
import { getLLMStats } from '../services/llm';
import { routesLogger } from '../services/logger';

const log = routesLogger;

// Track request statistics
let totalRequests = 0;
let pageRequests = 0;
let streamRequests = 0;
let checkRequests = 0;
let randomSeedRequests = 0;
let booksRequests = 0;
let statsRequests = 0;
let errorCount = 0;

async function parseReferrerContext(req: Request): Promise<ReferrerContext | undefined> {
  const referrerSeed = req.query.referrerSeed as string | undefined;
  const referrerPage = req.query.referrerPage ? parseInt(req.query.referrerPage as string, 10) : undefined;
  
  log.debug('Parsing referrer context from request', {
    referrerSeed,
    referrerPage,
    hasReferrerSeed: !!referrerSeed,
    hasReferrerPage: !!referrerPage,
  });
  
  if (referrerSeed && referrerPage && !isNaN(referrerPage)) {
    log.debug('Fetching referrer page from database', {
      referrerSeed,
      referrerPage,
    });
    
    // Fetch the referrer page content from the database
    const referrerPageData = await getPage(referrerSeed, referrerPage);
    
    if (referrerPageData) {
      log.info('Referrer context found and assembled', {
        referrerSeed,
        referrerPage,
        referrerContentLength: referrerPageData.content.length,
      });
      return {
        seed: referrerSeed,
        pageNumber: referrerPage,
        content: referrerPageData.content,
      };
    } else {
      log.warn('Referrer page not found in database', {
        referrerSeed,
        referrerPage,
      });
    }
  }
  
  log.debug('No referrer context available');
  return undefined;
}

const router = Router();

const CANONICAL_SEEDS = [
  'The detailed history of the future',
  'The autobiographies of the archangels',
  'The faithful catalog of the Library',
  'Thousands and thousands of false catalogs of the Library',
  'The proof of the falsity of thousands and thousands of false catalogs of the Library',
  'A proof of the falsity of the true catalog of the Library',
  'The gnostic gospel of Basilides',
  'The commentary upon the gnostic gospel of Basilides',
  'The commentary on the commentary of the gnostic gospel of Basilides',
  'The true story of your death',
  'The translation of every book into every language',
  'The interpolations of every book into all books',
  'The treatise Bede could have written (but did not) on the mythology of the Saxon people',
  'The lost books of Tacitus',
];

// Request logging middleware for API routes
router.use((req: Request, res: Response, next) => {
  totalRequests++;
  const requestId = totalRequests;
  
  log.info(`Incoming request #${requestId}`, {
    method: req.method,
    path: req.path,
    query: req.query,
    userAgent: req.get('user-agent')?.slice(0, 50),
    ip: req.ip || req.socket.remoteAddress,
  });
  
  const startTime = performance.now();
  
  res.on('finish', () => {
    const duration = performance.now() - startTime;
    log.info(`Request #${requestId} completed`, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration.toFixed(2)}ms`,
    });
  });
  
  next();
});

router.get('/random-seed', (req: Request, res: Response) => {
  randomSeedRequests++;
  
  const randomIndex = Math.floor(Math.random() * CANONICAL_SEEDS.length);
  const selectedSeed = CANONICAL_SEEDS[randomIndex];
  
  log.info('Random seed selected', {
    selectedSeed,
    index: randomIndex,
    totalCanonicalSeeds: CANONICAL_SEEDS.length,
    totalRandomSeedRequests: randomSeedRequests,
  });
  
  res.json({ seed: selectedSeed });
});

// Get all discovered books in the library
router.get('/books', async (req: Request, res: Response) => {
  booksRequests++;
  const requestStart = performance.now();
  
  try {
    log.info('GET /books request received', {
      totalBooksRequests: booksRequests,
    });
    
    const books = await getAllBooks();
    
    const totalDuration = performance.now() - requestStart;
    
    log.info('GET /books response ready', {
      bookCount: books.length,
      totalDuration: `${totalDuration.toFixed(2)}ms`,
    });
    
    res.json({
      books: books.map(book => ({
        seed: book.seed,
        pageCount: book.pageCount,
        firstDiscoveredAt: book.firstDiscoveredAt.toISOString(),
        lastDiscoveredAt: book.lastDiscoveredAt.toISOString(),
      })),
      totalBooks: books.length,
      totalPages: books.reduce((sum, b) => sum + b.pageCount, 0),
    });
  } catch (error) {
    errorCount++;
    const totalDuration = performance.now() - requestStart;
    
    log.error('GET /books failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${totalDuration.toFixed(2)}ms`,
    });
    
    res.status(500).json({ error: 'Failed to get books' });
  }
});

router.get('/page', async (req: Request, res: Response) => {
  pageRequests++;
  const requestStart = performance.now();
  
  try {
    const seed = req.query.seed as string;
    const pageNumber = parseInt(req.query.page as string, 10);
    
    log.info('GET /page request received', {
      seed,
      pageNumber,
      rawPage: req.query.page,
      totalPageRequests: pageRequests,
    });

    if (!seed || isNaN(pageNumber) || pageNumber < 1) {
      log.warn('Invalid request parameters', {
        seed,
        pageNumber,
        seedValid: !!seed,
        pageNumberValid: !isNaN(pageNumber) && pageNumber >= 1,
      });
      errorCount++;
      res.status(400).json({ error: 'Invalid seed or page number' });
      return;
    }

    // Parse referrer context if provided (for page 1 reached via reference click)
    log.debug('Checking for referrer context');
    const referrerContext = await parseReferrerContext(req);

    log.info('Calling getOrGeneratePage', {
      seed,
      pageNumber,
      hasReferrerContext: !!referrerContext,
    });
    
    const { page, isNewDiscovery } = await getOrGeneratePage(seed, pageNumber, referrerContext);
    
    const totalDuration = performance.now() - requestStart;
    
    log.info('GET /page response ready', {
      seed: page.seed,
      pageNumber: page.pageNumber,
      isNewDiscovery,
      contentLength: page.content.length,
      referencesCount: page.references.length,
      totalDuration: `${totalDuration.toFixed(2)}ms`,
    });

    res.json({
      seed: page.seed,
      pageNumber: page.pageNumber,
      content: page.content,
      references: page.references,
      discoveredAt: page.discoveredAt?.toISOString(),
      isNewDiscovery,
    });
  } catch (error) {
    errorCount++;
    const totalDuration = performance.now() - requestStart;
    
    log.error('GET /page failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${totalDuration.toFixed(2)}ms`,
      seed: req.query.seed,
      page: req.query.page,
    });
    
    res.status(500).json({ error: 'Failed to get page' });
  }
});

router.get('/page/stream', async (req: Request, res: Response) => {
  streamRequests++;
  const requestStart = performance.now();
  
  try {
    const seed = req.query.seed as string;
    const pageNumber = parseInt(req.query.page as string, 10);
    
    log.separator(`STREAM REQUEST: "${seed}" p.${pageNumber}`);
    
    log.info('GET /page/stream request received', {
      seed,
      pageNumber,
      totalStreamRequests: streamRequests,
    });

    if (!seed || isNaN(pageNumber) || pageNumber < 1) {
      log.warn('Invalid stream request parameters', {
        seed,
        pageNumber,
        seedValid: !!seed,
        pageNumberValid: !isNaN(pageNumber) && pageNumber >= 1,
      });
      errorCount++;
      res.status(400).json({ error: 'Invalid seed or page number' });
      return;
    }

    // Parse referrer context if provided (for page 1 reached via reference click)
    log.debug('Checking for referrer context in stream request');
    const referrerContext = await parseReferrerContext(req);

    log.info('Setting up SSE response headers');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Handle client disconnect
    req.on('close', () => {
      log.warn('Client disconnected during stream', {
        seed,
        pageNumber,
        elapsedTime: `${(performance.now() - requestStart).toFixed(2)}ms`,
      });
    });

    log.info('Starting stream iteration');
    let eventCount = 0;
    let chunkCount = 0;
    
    for await (const event of streamOrGetPage(seed, pageNumber, referrerContext)) {
      eventCount++;
      
      if (event.type === 'existing') {
        log.info('SSE: Sending existing page event', {
          seed: event.page.seed,
          pageNumber: event.page.pageNumber,
          contentLength: event.page.content.length,
        });
        
        res.write(`event: existing\n`);
        res.write(`data: ${JSON.stringify({
          seed: event.page.seed,
          pageNumber: event.page.pageNumber,
          content: event.page.content,
          references: event.page.references,
          discoveredAt: event.page.discoveredAt?.toISOString(),
          isNewDiscovery: false,
        })}\n\n`);
        
      } else if (event.type === 'chunk') {
        chunkCount++;
        
        // Log every 25th chunk to avoid spam
        if (chunkCount % 25 === 0) {
          log.debug('SSE: Chunk progress', {
            chunkCount,
            chunkLength: event.text.length,
            elapsedTime: `${(performance.now() - requestStart).toFixed(2)}ms`,
          });
        }
        
        res.write(`event: chunk\n`);
        res.write(`data: ${JSON.stringify({ text: event.text })}\n\n`);
        
      } else if (event.type === 'complete') {
        log.info('SSE: Sending complete event', {
          seed: event.page.seed,
          pageNumber: event.page.pageNumber,
          referencesCount: event.page.references.length,
          totalChunks: chunkCount,
        });
        
        res.write(`event: complete\n`);
        res.write(`data: ${JSON.stringify({
          seed: event.page.seed,
          pageNumber: event.page.pageNumber,
          references: event.page.references,
          discoveredAt: event.page.discoveredAt?.toISOString(),
          isNewDiscovery: true,
        })}\n\n`);
      }
    }

    log.info('SSE: Sending done event');
    res.write(`event: done\n`);
    res.write(`data: {}\n\n`);
    
    const totalDuration = performance.now() - requestStart;
    log.info('Stream request completed successfully', {
      seed,
      pageNumber,
      totalEvents: eventCount,
      totalChunks: chunkCount,
      totalDuration: `${totalDuration.toFixed(2)}ms`,
    });
    
    res.end();
    
  } catch (error) {
    errorCount++;
    const totalDuration = performance.now() - requestStart;
    
    log.error('GET /page/stream failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${totalDuration.toFixed(2)}ms`,
      seed: req.query.seed,
      page: req.query.page,
    });
    
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ error: 'Failed to generate page' })}\n\n`);
    res.end();
  }
});

router.get('/page/check', async (req: Request, res: Response) => {
  checkRequests++;
  
  try {
    const seed = req.query.seed as string;
    const pageNumber = parseInt(req.query.page as string, 10);
    
    log.info('GET /page/check request received', {
      seed,
      pageNumber,
      totalCheckRequests: checkRequests,
    });

    if (!seed || isNaN(pageNumber) || pageNumber < 1) {
      log.warn('Invalid check request parameters', {
        seed,
        pageNumber,
      });
      errorCount++;
      res.status(400).json({ error: 'Invalid seed or page number' });
      return;
    }

    const page = await getPage(seed, pageNumber);
    const exists = page !== null;
    
    log.info('Page existence check result', {
      seed,
      pageNumber,
      exists,
    });
    
    res.json({ exists });
    
  } catch (error) {
    errorCount++;
    log.error('GET /page/check failed', {
      error: error instanceof Error ? error.message : String(error),
      seed: req.query.seed,
      page: req.query.page,
    });
    res.status(500).json({ error: 'Failed to check page' });
  }
});

// Stats endpoint for monitoring
router.get('/stats', (req: Request, res: Response) => {
  statsRequests++;
  
  const stats = {
    routes: {
      totalRequests,
      pageRequests,
      streamRequests,
      checkRequests,
      randomSeedRequests,
      booksRequests,
      statsRequests,
      errorCount,
      errorRate: totalRequests > 0 ? `${((errorCount / totalRequests) * 100).toFixed(2)}%` : '0%',
    },
    generator: getGeneratorStats(),
    llm: getLLMStats(),
    database: getPoolStats(),
    canonicalSeeds: CANONICAL_SEEDS.length,
    uptime: process.uptime(),
  };
  
  log.info('Stats requested', stats);
  
  res.json(stats);
});

export default router;
