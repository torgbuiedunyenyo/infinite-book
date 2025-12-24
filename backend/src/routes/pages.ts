import { Router, Request, Response } from 'express';
import { getOrGeneratePage, streamOrGetPage, ReferrerContext } from '../services/pageGenerator';
import { getPage } from '../services/database';

async function parseReferrerContext(req: Request): Promise<ReferrerContext | undefined> {
  const referrerSeed = req.query.referrerSeed as string | undefined;
  const referrerPage = req.query.referrerPage ? parseInt(req.query.referrerPage as string, 10) : undefined;
  
  if (referrerSeed && referrerPage && !isNaN(referrerPage)) {
    // Fetch the referrer page content from the database
    const referrerPageData = await getPage(referrerSeed, referrerPage);
    if (referrerPageData) {
      return {
        seed: referrerSeed,
        pageNumber: referrerPage,
        content: referrerPageData.content,
      };
    }
  }
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

router.get('/random-seed', (req: Request, res: Response) => {
  const randomIndex = Math.floor(Math.random() * CANONICAL_SEEDS.length);
  res.json({ seed: CANONICAL_SEEDS[randomIndex] });
});

router.get('/page', async (req: Request, res: Response) => {
  try {
    const seed = req.query.seed as string;
    const pageNumber = parseInt(req.query.page as string, 10);

    if (!seed || isNaN(pageNumber) || pageNumber < 1) {
      res.status(400).json({ error: 'Invalid seed or page number' });
      return;
    }

    // Parse referrer context if provided (for page 1 reached via reference click)
    const referrerContext = await parseReferrerContext(req);

    const { page, isNewDiscovery } = await getOrGeneratePage(seed, pageNumber, referrerContext);

    res.json({
      seed: page.seed,
      pageNumber: page.pageNumber,
      content: page.content,
      references: page.references,
      discoveredAt: page.discoveredAt?.toISOString(),
      isNewDiscovery,
    });
  } catch (error) {
    console.error('Error getting page:', error);
    res.status(500).json({ error: 'Failed to get page' });
  }
});

router.get('/page/stream', async (req: Request, res: Response) => {
  try {
    const seed = req.query.seed as string;
    const pageNumber = parseInt(req.query.page as string, 10);

    if (!seed || isNaN(pageNumber) || pageNumber < 1) {
      res.status(400).json({ error: 'Invalid seed or page number' });
      return;
    }

    // Parse referrer context if provided (for page 1 reached via reference click)
    const referrerContext = await parseReferrerContext(req);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const event of streamOrGetPage(seed, pageNumber, referrerContext)) {
      if (event.type === 'existing') {
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
        res.write(`event: chunk\n`);
        res.write(`data: ${JSON.stringify({ text: event.text })}\n\n`);
      } else if (event.type === 'complete') {
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

    res.write(`event: done\n`);
    res.write(`data: {}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error streaming page:', error);
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ error: 'Failed to generate page' })}\n\n`);
    res.end();
  }
});

router.get('/page/check', async (req: Request, res: Response) => {
  try {
    const seed = req.query.seed as string;
    const pageNumber = parseInt(req.query.page as string, 10);

    if (!seed || isNaN(pageNumber) || pageNumber < 1) {
      res.status(400).json({ error: 'Invalid seed or page number' });
      return;
    }

    const page = await getPage(seed, pageNumber);
    res.json({ exists: page !== null });
  } catch (error) {
    console.error('Error checking page:', error);
    res.status(500).json({ error: 'Failed to check page' });
  }
});

export default router;

