# The Infinite Book — Complete Setup Guide

This guide provides extremely detailed, sequential steps to build The Infinite Book from scratch. Execute each step in order.

---

## Prerequisites

Before starting, ensure you have:
- Node.js 18+ installed
- npm installed
- A Railway account (https://railway.app)
- An Anthropic API key (https://console.anthropic.com)
- PostgreSQL client (psql) installed locally (optional, for running migrations)

---

## Phase 1: Project Initialization

### Step 1.1: Create the project directory structure

```bash
mkdir -p library-of-babel/{backend/src/{routes,services,prompts},frontend/src,database}
cd library-of-babel
```

### Step 1.2: Create .gitignore

```bash
cat > .gitignore << 'EOF'
node_modules/
dist/
.env
*.log
.DS_Store
EOF
```

---

## Phase 2: Backend Setup

### Step 2.1: Navigate to backend directory

```bash
cd backend
```

### Step 2.2: Initialize package.json

```bash
npm init -y
```

### Step 2.3: Install production dependencies

```bash
npm install express cors dotenv pg @anthropic-ai/sdk
```

### Step 2.4: Install development dependencies

```bash
npm install -D typescript @types/express @types/cors @types/node @types/pg ts-node nodemon
```

### Step 2.5: Initialize TypeScript configuration

```bash
npx tsc --init
```

### Step 2.6: Replace tsconfig.json content

Open `backend/tsconfig.json` and replace entire contents with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 2.7: Update package.json scripts

Open `backend/package.json` and replace the `"scripts"` section with:

```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

### Step 2.8: Create .env file

```bash
cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres:password@localhost:5432/infinite_book
ANTHROPIC_API_KEY=sk-ant-your-key-here
PORT=3000
EOF
```

**Important:** Replace `sk-ant-your-key-here` with your actual Anthropic API key.

### Step 2.9: Create types.ts

Create file `backend/src/types.ts`:

```typescript
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
}

export interface NeighborPages {
  prev: Page[];
  next: Page[];
}

export interface GetOrGenerateResult {
  page: Page;
  isNewDiscovery: boolean;
}
```

### Step 2.10: Create database service

Create file `backend/src/services/database.ts`:

```typescript
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
```

### Step 2.11: Create prompt templates

Create file `backend/src/prompts/templates.ts`:

```typescript
import { GenerationContext } from '../types';

// Exported as system message for the API call (uses XML tags per Anthropic best practices)
export const SYSTEM_PROMPT = `<context>
The Infinite Book is a single, boundless book that contains all possible books. Users navigate it by flipping pages and following references. There is no search, no input field, no generation prompt — only the ancient gestures of reading: turning pages and pursuing citations.

Every page exists at a unique address. Once visited, a page is fixed forever. The library exists in potential; your visit collapses it into permanence.

The Infinite Book is a reading experience where:
- You are always inside a book, on a page
- You navigate by flipping pages (sequential) or tapping [[references]] (associative)
- Every page exists at a permanent address (seed, page_number)
- First visitors discover pages; all subsequent visitors see the same content
- Pages contain [[references]] to other seeds, creating an infinite web
- There is no search, no input, no generation prompt — only reading and following
- The content is AI-generated but presented as found, not created
- The aesthetic is that of a physical book: typography, page turns, silence

The result is an infinite, explorable, self-consistent library that reveals itself through the simple act of reading.
</context>

<architecture>
- Each page has an address: (seed, page_number)
- The seed is a string (e.g., "The lost books of Tacitus")
- The page_number is a positive integer starting at 1
- When a user requests a page that doesn't exist, this prompt is called to generate it
- Once generated, pages are stored permanently and returned verbatim on future requests
</architecture>

<navigation>
- Users flip forward/backward (incrementing/decrementing page_number within the same seed)
- Users tap [[references]] embedded in the text
- Tapping a [[reference]] navigates to (reference_text, 1) — the bracketed text becomes the seed for a new book
</navigation>

<references>
- Text inside [[double brackets]] becomes a tappable link
- The bracketed text becomes the seed for the linked book
- Example 1: "described in [[The Anatomy of Silence]]" — tapping navigates to a book with seed "The Anatomy of Silence"
- Example 2: "she said, choosing her words [[with care]]" — tapping navigates to a book with seed "With Care"
- References should be specific strings that work as book titles, author names, document names, or subjects
</references>

<task>
Generate page content for this system.
</task>`;

export function buildPrompt(context: GenerationContext): string {
  const { seed, pageNumber, prevPages, nextPages, referrerContext } = context;

  let prompt = '';

  // CONTEXT FIRST: Provide all existing pages/documents before instructions
  const hasPrevPages = prevPages.length > 0;
  const hasNextPages = nextPages.length > 0;

  if (hasPrevPages || hasNextPages) {
    prompt += `<existing_pages>\n`;
    
    // Previous pages in order (e.g., page 3, then page 4 if generating page 5)
    for (const page of prevPages) {
      prompt += `<page number="${page.pageNumber}">\n${page.content}\n</page>\n\n`;
    }
    
    // Next pages in order (e.g., page 6, then page 7 if generating page 5)
    for (const page of nextPages) {
      prompt += `<page number="${page.pageNumber}">\n${page.content}\n</page>\n\n`;
    }
    
    prompt += `</existing_pages>\n\n`;
  } else if (pageNumber === 1 && referrerContext) {
    prompt += `<referrer_context>\n`;
    prompt += `<referrer_seed>${referrerContext.seed}</referrer_seed>\n`;
    prompt += `<referrer_page number="${referrerContext.pageNumber}">\n${referrerContext.content}\n</referrer_page>\n`;
    prompt += `</referrer_context>\n\n`;
  }

  // REQUEST: What we're asking for
  prompt += `<request>\n`;
  prompt += `<seed>${seed}</seed>\n`;
  prompt += `<page_number>${pageNumber}</page_number>\n`;
  prompt += `</request>\n\n`;

  // INSTRUCTIONS LAST: After all context has been provided
  prompt += `<instructions>\n`;
  
  if (hasPrevPages && hasNextPages) {
    const immediatePrev = prevPages[prevPages.length - 1];
    const immediateNext = nextPages[0];
    prompt += `Generate page ${pageNumber}, which must flow naturally from page ${immediatePrev.pageNumber} and lead seamlessly into page ${immediateNext.pageNumber}.\n`;
  } else if (hasPrevPages) {
    const immediatePrev = prevPages[prevPages.length - 1];
    prompt += `Generate page ${pageNumber}, continuing naturally from page ${immediatePrev.pageNumber}.\n`;
  } else if (hasNextPages) {
    const immediateNext = nextPages[0];
    prompt += `Generate page ${pageNumber}, which must lead naturally into page ${immediateNext.pageNumber}.\n`;
  } else if (pageNumber === 1 && referrerContext) {
    prompt += `The reader arrived at this book by clicking the reference [[${seed}]] which appeared in another book.\n`;
    prompt += `This is PAGE 1 of a COMPLETELY NEW AND DIFFERENT BOOK titled "${seed}".\n`;
    prompt += `This is NOT a continuation of the referring page above.\n`;
    prompt += `The referring page is provided ONLY to understand the context in which "${seed}" was mentioned.\n`;
    prompt += `Use that context to inform what kind of book "${seed}" might be, but write the BEGINNING of this new book.\n`;
    prompt += `The new book should have its own voice, style, and narrative starting point.\n`;
    prompt += `It should feel like opening a different volume entirely.\n`;
  } else if (pageNumber === 1) {
    prompt += `This is page 1 — the opening of this book. No other pages exist yet.\n`;
  } else {
    prompt += `No neighboring pages exist yet.\n`;
  }
  prompt += `</instructions>\n\n`;

  prompt += `<output_requirements>\n`;
  prompt += `- ~200-250 words\n`;
  prompt += `- Include [[references]]\n`;
  prompt += `- End at a natural break\n`;
  prompt += `- Content only, no meta-commentary\n`;
  prompt += `</output_requirements>`;

  return prompt;
}
```

### Step 2.12: Create LLM service

Create file `backend/src/services/llm.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { GenerationContext } from '../types';
import { buildPrompt, SYSTEM_PROMPT } from '../prompts/templates';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generatePageContent(context: GenerationContext): Promise<string> {
  const prompt = buildPrompt(context);

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5-20251101',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    thinking: {
      type: 'enabled',
      budget_tokens: 10000,
    },
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in LLM response');
  }

  return textBlock.text;
}

export async function* streamPageContent(
  context: GenerationContext
): AsyncGenerator<string, void, unknown> {
  const prompt = buildPrompt(context);

  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-5-20251101',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    thinking: {
      type: 'enabled',
      budget_tokens: 10000,
    },
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
```

### Step 2.13: Create page generator service

Create file `backend/src/services/pageGenerator.ts`:

```typescript
import { Page, Reference, GenerationContext, GetOrGenerateResult } from '../types';
import { getPage, getNeighborPages, savePage } from './database';
import { generatePageContent, streamPageContent } from './llm';

function extractOpening(content: string): string {
  const words = content.split(/\s+/);
  if (words.length <= 50) {
    return content;
  }
  
  const first60 = words.slice(0, 60).join(' ');
  const sentenceEnd = first60.search(/[.!?]\s/);
  
  if (sentenceEnd > 0 && sentenceEnd < first60.length - 10) {
    return first60.slice(0, sentenceEnd + 1);
  }
  
  return words.slice(0, 50).join(' ') + '...';
}

function extractClosing(content: string): string {
  const words = content.split(/\s+/);
  if (words.length <= 50) {
    return content;
  }
  
  const last60 = words.slice(-60).join(' ');
  const sentenceStart = last60.search(/[.!?]\s/);
  
  if (sentenceStart > 0) {
    return last60.slice(sentenceStart + 2);
  }
  
  return '...' + words.slice(-50).join(' ');
}

function extractReferences(content: string): Reference[] {
  const pattern = /\[\[([^\]]+)\]\]/g;
  const references: Reference[] = [];
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const text = match[1];
    if (!references.some((ref) => ref.text === text)) {
      references.push({
        text: text,
        seed: text,
      });
    }
  }

  return references;
}

export interface ReferrerContext {
  seed: string;
  pageNumber: number;
  content: string;
}

export async function getOrGeneratePage(
  seed: string,
  pageNumber: number,
  referrerContext?: ReferrerContext
): Promise<GetOrGenerateResult> {
  const existingPage = await getPage(seed, pageNumber);
  if (existingPage) {
    return { page: existingPage, isNewDiscovery: false };
  }

  const neighbors = await getNeighborPages(seed, pageNumber);

  const context: GenerationContext = {
    seed,
    pageNumber,
    prevPages: neighbors.prev,
    nextPages: neighbors.next,
    // Only include referrer context for page 1 when no neighboring pages exist
    referrerContext: pageNumber === 1 && neighbors.prev.length === 0 && neighbors.next.length === 0 ? referrerContext : undefined,
  };

  const content = await generatePageContent(context);

  const opening = extractOpening(content);
  const closing = extractClosing(content);
  const references = extractReferences(content);

  const newPage: Page = {
    seed,
    pageNumber,
    content,
    opening,
    closing,
    references,
  };

  const savedPage = await savePage(newPage);
  return { page: savedPage, isNewDiscovery: true };
}

export async function* streamOrGetPage(
  seed: string,
  pageNumber: number,
  referrerContext?: ReferrerContext
): AsyncGenerator<
  | { type: 'existing'; page: Page }
  | { type: 'chunk'; text: string }
  | { type: 'complete'; page: Page },
  void,
  unknown
> {
  const existingPage = await getPage(seed, pageNumber);
  if (existingPage) {
    yield { type: 'existing', page: existingPage };
    return;
  }

  const neighbors = await getNeighborPages(seed, pageNumber);

  const context: GenerationContext = {
    seed,
    pageNumber,
    prevPages: neighbors.prev,
    nextPages: neighbors.next,
    // Only include referrer context for page 1 when no neighboring pages exist
    referrerContext: pageNumber === 1 && neighbors.prev.length === 0 && neighbors.next.length === 0 ? referrerContext : undefined,
  };

  let fullContent = '';
  for await (const chunk of streamPageContent(context)) {
    fullContent += chunk;
    yield { type: 'chunk', text: chunk };
  }

  const opening = extractOpening(fullContent);
  const closing = extractClosing(fullContent);
  const references = extractReferences(fullContent);

  const newPage: Page = {
    seed,
    pageNumber,
    content: fullContent,
    opening,
    closing,
    references,
  };

  const savedPage = await savePage(newPage);
  yield { type: 'complete', page: savedPage };
}
```

### Step 2.14: Create API routes

Create file `backend/src/routes/pages.ts`:

```typescript
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
```

### Step 2.15: Create main server entry point

Create file `backend/src/index.ts`:

```typescript
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import pagesRouter from './routes/pages';
import { checkConnection } from './services/database';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api', pagesRouter);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend')));
  
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../frontend/index.html'));
    }
  });
}

app.get('/health', async (req, res) => {
  const dbConnected = await checkConnection();
  res.json({
    status: dbConnected ? 'healthy' : 'unhealthy',
    database: dbConnected ? 'connected' : 'disconnected',
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

// Keep process alive
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close();
});
```

---

## Phase 3: Database Setup

### Step 3.1: Create the database schema file

Create file `database/schema.sql`:

```sql
CREATE TABLE pages (
    id SERIAL PRIMARY KEY,
    seed TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    opening TEXT NOT NULL,
    closing TEXT NOT NULL,
    "references" JSONB DEFAULT '[]'::jsonb,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_seed_page UNIQUE (seed, page_number)
);

CREATE INDEX idx_pages_seed ON pages(seed);
CREATE INDEX idx_pages_seed_page ON pages(seed, page_number);
```

### Step 3.2: Set up PostgreSQL on Railway

1. Go to https://railway.app and log in
2. Click "New Project"
3. Click "Deploy from GitHub repo" or "Empty Project"
4. If empty project: Click "New" → "Database" → "Add PostgreSQL"
5. Wait for the database to provision (30-60 seconds)
6. Click on the PostgreSQL service
7. Go to the "Variables" tab
8. Find and copy the `DATABASE_URL` value

### Step 3.3: Update your .env file

Edit `backend/.env` and replace the DATABASE_URL with your Railway URL:

```
DATABASE_URL=postgresql://postgres:xxxxx@xxxxx.railway.app:5432/railway
ANTHROPIC_API_KEY=sk-ant-your-key-here
PORT=3000
```

### Step 3.4: Run the database schema

From the project root:

```bash
psql "YOUR_DATABASE_URL_HERE" -f database/schema.sql
```

Or use Railway's Data tab:
1. Click on your PostgreSQL service in Railway
2. Go to the "Data" tab
3. Click "Query"
4. Paste the contents of `database/schema.sql`
5. Click "Run"

---

## Phase 4: Frontend Setup

### Step 4.1: Navigate to frontend directory

```bash
cd ../frontend
```

(Or from project root: `cd frontend`)

### Step 4.2: Initialize package.json

```bash
npm init -y
```

### Step 4.3: Install Vite and marked

```bash
npm install vite marked
```

### Step 4.4: Install TypeScript

```bash
npm install -D typescript
```

### Step 4.5: Create vite.config.ts

Create file `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
```

### Step 4.6: Update package.json scripts

Edit `frontend/package.json` and set the scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### Step 4.7: Create index.html

Create file `frontend/src/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The Infinite Book</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="./styles.css">
</head>
<body>
    <div id="book">
        <div id="page">
            <div id="page-number"></div>
            <div id="content"></div>
        </div>
        <div id="nav-left" class="nav-zone"></div>
        <div id="nav-right" class="nav-zone"></div>
    </div>
    <script type="module" src="./app.ts"></script>
</body>
</html>
```

### Step 4.8: Create styles.css

Create file `frontend/src/styles.css`:

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

html, body {
    height: 100%;
    background: #f8f5f0;
}

body {
    font-family: 'EB Garamond', serif;
    font-size: 20px;
    line-height: 1.7;
    color: #1a1a1a;
}

#book {
    position: relative;
    max-width: 700px;
    min-height: 100vh;
    margin: 0 auto;
    padding: 60px 50px;
}

#page {
    position: relative;
}

#page-number {
    position: absolute;
    top: -40px;
    right: 0;
    font-size: 14px;
    color: #666;
}

#content {
    text-align: justify;
    hyphens: auto;
}

#content p {
    margin-bottom: 1.5em;
    text-indent: 1.5em;
}

#content p:first-child,
#content h1 + p,
#content h2 + p,
#content h3 + p,
#content hr + p {
    text-indent: 0;
}

/* Markdown headings */
#content h1 {
    font-size: 1.6em;
    font-weight: 500;
    margin: 0 0 1em 0;
    text-align: left;
    text-indent: 0;
}

#content h2 {
    font-size: 1.3em;
    font-weight: 500;
    margin: 1.5em 0 0.8em 0;
    text-align: left;
    text-indent: 0;
}

#content h3 {
    font-size: 1.1em;
    font-weight: 500;
    font-style: italic;
    margin: 1.2em 0 0.6em 0;
    text-align: left;
    text-indent: 0;
}

/* Horizontal rule */
#content hr {
    border: none;
    text-align: center;
    margin: 2em 0;
}

#content hr::before {
    content: "* * *";
    color: #666;
    letter-spacing: 0.5em;
}

/* Emphasis */
#content em {
    font-style: italic;
}

#content strong {
    font-weight: 600;
}

/* Block quotes */
#content blockquote {
    margin: 1.5em 2em;
    padding-left: 1em;
    border-left: 2px solid #c0c0d0;
    font-style: italic;
}

#content blockquote p {
    text-indent: 0;
}

.reference {
    color: #4a4a6a;
    text-decoration: none;
    border-bottom: 1px solid #c0c0d0;
    cursor: pointer;
    transition: border-color 0.2s;
}

.reference:hover {
    border-color: #4a4a6a;
}

.nav-zone {
    position: fixed;
    top: 0;
    width: 100px;
    height: 100%;
    cursor: pointer;
    z-index: 10;
}

#nav-left {
    left: 0;
}

#nav-right {
    right: 0;
}

#content.loading {
    opacity: 0.6;
}

.streaming-cursor {
    display: inline-block;
    width: 2px;
    height: 1.2em;
    background: #1a1a1a;
    margin-left: 2px;
    animation: blink 1s infinite;
    vertical-align: text-bottom;
}

@keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
}

@media (max-width: 768px) {
    body {
        font-size: 18px;
    }
    
    #book {
        padding: 40px 30px;
    }
    
    .nav-zone {
        width: 60px;
    }
}
```

### Step 4.9: Create types.ts

Create file `frontend/src/types.ts`:

```typescript
export interface Reference {
  text: string;
  seed: string;
}

export interface PageData {
  seed: string;
  pageNumber: number;
  content: string;
  references: Reference[];
  discoveredAt: string;
  isNewDiscovery: boolean;
}
```

### Step 4.10: Create navigation.ts

Create file `frontend/src/navigation.ts`:

```typescript
export interface Location {
  seed: string;
  page: number;
}

const history: Location[] = [];
let currentLocation: Location | null = null;

export function getCurrentLocation(): Location | null {
  return currentLocation;
}

export function setCurrentLocation(location: Location): void {
  if (currentLocation) {
    history.push({ ...currentLocation });
  }
  currentLocation = location;
  updateURL(location);
}

export function goBack(): Location | null {
  if (history.length === 0) {
    return null;
  }
  currentLocation = history.pop()!;
  updateURL(currentLocation);
  return currentLocation;
}

export function canGoBack(): boolean {
  return history.length > 0;
}

function updateURL(location: Location): void {
  const encodedSeed = encodeURIComponent(location.seed);
  const path = `/${encodedSeed}/${location.page}`;
  window.history.pushState({ seed: location.seed, page: location.page }, '', path);
}

export function parseURL(): Location | null {
  const path = window.location.pathname;
  
  if (path === '/' || path === '') {
    return null;
  }
  
  const match = path.match(/^\/(.+?)(?:\/(\d+))?$/);
  if (!match) {
    return null;
  }
  
  const seed = decodeURIComponent(match[1]);
  const page = match[2] ? parseInt(match[2], 10) : 1;
  
  return { seed, page };
}

export function setupPopStateHandler(onNavigate: (location: Location) => void): void {
  window.addEventListener('popstate', (event) => {
    if (event.state && event.state.seed) {
      currentLocation = { seed: event.state.seed, page: event.state.page };
      onNavigate(currentLocation);
    }
  });
}
```

### Step 4.11: Create renderer.ts

Create file `frontend/src/renderer.ts`:

```typescript
import { Reference } from './types';
import { marked } from 'marked';

// Configure marked for safe rendering
marked.setOptions({
  gfm: true,
  breaks: false,
});

const contentEl = document.getElementById('content')!;
const pageNumberEl = document.getElementById('page-number')!;

let currentReferences: Reference[] = [];

export function setPageNumber(num: number): void {
  pageNumberEl.textContent = `p. ${num}`;
}

export function clearContent(): void {
  contentEl.innerHTML = '';
  currentReferences = [];
}

export function setLoading(loading: boolean): void {
  contentEl.classList.toggle('loading', loading);
}

export function renderContent(content: string, references: Reference[]): void {
  currentReferences = references;
  contentEl.innerHTML = formatContent(content);
  attachReferenceHandlers();
}

export function appendChunk(fullText: string): void {
  const cursor = contentEl.querySelector('.streaming-cursor');
  if (cursor) {
    cursor.remove();
  }
  
  // Use the full accumulated text passed in, not textContent from DOM
  // (textContent loses paragraph breaks from <p> tags)
  contentEl.innerHTML = formatContentSimple(fullText);
  
  const cursorSpan = document.createElement('span');
  cursorSpan.className = 'streaming-cursor';
  contentEl.appendChild(cursorSpan);
}

export function finalizeStreaming(fullText: string, references: Reference[]): void {
  const cursor = contentEl.querySelector('.streaming-cursor');
  if (cursor) {
    cursor.remove();
  }
  
  // Use the full text passed in, not textContent from DOM
  // (textContent loses paragraph breaks from <p> tags)
  currentReferences = references;
  contentEl.innerHTML = formatContent(fullText);
  attachReferenceHandlers();
}

function formatContentSimple(text: string): string {
  // During streaming, use simple markdown parsing without reference links
  // This gives a preview while content is being generated
  return marked.parse(text) as string;
}

function formatContent(text: string): string {
  // First convert [[references]] to a placeholder that won't be affected by markdown
  // Use a unique marker without special markdown characters (no underscores, asterisks, etc.)
  const refPlaceholders: { placeholder: string; refText: string }[] = [];
  let placeholderIndex = 0;
  
  const textWithPlaceholders = text.replace(/\[\[([^\]]+)\]\]/g, (match, refText) => {
    const placeholder = `XREFX${placeholderIndex}XENDX`;
    refPlaceholders.push({ placeholder, refText });
    placeholderIndex++;
    return placeholder;
  });
  
  // Parse markdown
  let html = marked.parse(textWithPlaceholders) as string;
  
  // Replace placeholders with actual reference spans
  for (const { placeholder, refText } of refPlaceholders) {
    html = html.replace(
      placeholder,
      `<span class="reference" data-seed="${escapeAttr(refText)}">${escapeHtml(refText)}</span>`
    );
  }
  
  return html;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let referenceClickHandler: ((seed: string) => void) | null = null;

export function onReferenceClick(handler: (seed: string) => void): void {
  referenceClickHandler = handler;
}

function attachReferenceHandlers(): void {
  const refs = contentEl.querySelectorAll('.reference');
  refs.forEach(ref => {
    ref.addEventListener('click', (e) => {
      e.preventDefault();
      const seed = (ref as HTMLElement).dataset.seed;
      if (seed && referenceClickHandler) {
        referenceClickHandler(seed);
      }
    });
  });
}
```

### Step 4.12: Create app.ts

Create file `frontend/src/app.ts`:

```typescript
import {
  Location,
  getCurrentLocation,
  setCurrentLocation,
  goBack,
  parseURL,
  setupPopStateHandler,
} from './navigation';
import {
  setPageNumber,
  clearContent,
  setLoading,
  renderContent,
  appendChunk,
  finalizeStreaming,
  onReferenceClick,
} from './renderer';
import { PageData, Reference } from './types';

const prefetchCache = new Map<string, PageData>();
const prefetchInProgress = new Set<string>();

// Track the current page's content for referrer context
let currentPageContent: string | null = null;

// Extract references from raw text (for error recovery when 'complete' event wasn't received)
function extractReferencesFromText(text: string): Reference[] {
  const pattern = /\[\[([^\]]+)\]\]/g;
  const refs: Reference[] = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const refText = match[1];
    if (!refs.some(r => r.text === refText)) {
      refs.push({ text: refText, seed: refText });
    }
  }
  return refs;
}

interface ReferrerInfo {
  seed: string;
  page: number;
}

function locationKey(seed: string, page: number): string {
  return `${seed}::${page}`;
}

async function fetchRandomSeed(): Promise<string> {
  const res = await fetch('/api/random-seed');
  const data = await res.json();
  return data.seed;
}

async function fetchPageStreaming(seed: string, page: number, referrer?: ReferrerInfo): Promise<void> {
  const key = locationKey(seed, page);
  
  const cached = prefetchCache.get(key);
  if (cached) {
    prefetchCache.delete(key);
    currentPageContent = cached.content;
    renderContent(cached.content, cached.references);
    return;
  }
  
  clearContent();
  
  // Build URL with optional referrer context (for page 1 reached via reference click)
  let url = `/api/page/stream?seed=${encodeURIComponent(seed)}&page=${page}`;
  if (referrer && page === 1) {
    url += `&referrerSeed=${encodeURIComponent(referrer.seed)}&referrerPage=${referrer.page}`;
  }
  
  const eventSource = new EventSource(url);
  
  let references: Reference[] = [];
  let streamedContent = '';
  
  return new Promise((resolve, reject) => {
    eventSource.addEventListener('existing', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as PageData;
      currentPageContent = data.content;
      renderContent(data.content, data.references);
    });
    
    eventSource.addEventListener('chunk', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      streamedContent += data.text;
      appendChunk(streamedContent);  // Pass full accumulated text, not just the chunk
    });
    
    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      references = data.references;
      currentPageContent = streamedContent;
    });
    
    eventSource.addEventListener('done', () => {
      eventSource.close();
      // Always finalize to remove cursor and convert [[refs]] to links
      // If we didn't get references from 'complete' event, extract them from text
      if (references.length === 0) {
        references = extractReferencesFromText(streamedContent);
      }
      finalizeStreaming(streamedContent, references);
      resolve();
    });
    
    eventSource.addEventListener('error', (e) => {
      eventSource.close();
      // Still finalize the streamed content even on error - content was already displayed
      // Extract references from the streamed text since we may not have received the 'complete' event
      const extractedRefs = extractReferencesFromText(streamedContent);
      finalizeStreaming(streamedContent, extractedRefs);
      reject(new Error('Stream error'));
    });
  });
}

async function prefetchPage(seed: string, page: number): Promise<void> {
  const key = locationKey(seed, page);
  
  if (prefetchCache.has(key) || prefetchInProgress.has(key)) {
    return;
  }
  
  prefetchInProgress.add(key);
  
  try {
    const res = await fetch(`/api/page?seed=${encodeURIComponent(seed)}&page=${page}`);
    if (res.ok) {
      const data = await res.json() as PageData;
      prefetchCache.set(key, data);
    }
  } catch (e) {
    // Prefetch failure is non-critical
  } finally {
    prefetchInProgress.delete(key);
  }
}

async function navigateTo(seed: string, page: number, referrer?: ReferrerInfo): Promise<void> {
  setCurrentLocation({ seed, page });
  setPageNumber(page);
  setLoading(true);
  
  try {
    await fetchPageStreaming(seed, page, referrer);
    
    prefetchPage(seed, page + 1);
    if (page > 1) {
      prefetchPage(seed, page - 1);
    }
  } catch (e) {
    console.error('Navigation error:', e);
  } finally {
    setLoading(false);
  }
}

function handleNavLeft(): void {
  const loc = getCurrentLocation();
  if (loc && loc.page > 1) {
    navigateTo(loc.seed, loc.page - 1);
  }
}

function handleNavRight(): void {
  const loc = getCurrentLocation();
  if (loc) {
    navigateTo(loc.seed, loc.page + 1);
  }
}

function handleReferenceClick(seed: string): void {
  // Pass the current location as referrer context so the new book
  // can be contextualized by where the reference was clicked
  const currentLoc = getCurrentLocation();
  const referrer = currentLoc ? { seed: currentLoc.seed, page: currentLoc.page } : undefined;
  navigateTo(seed, 1, referrer);
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'ArrowLeft') {
    handleNavLeft();
  } else if (e.key === 'ArrowRight') {
    handleNavRight();
  } else if (e.key === 'Backspace') {
    const prev = goBack();
    if (prev) {
      setPageNumber(prev.page);
      fetchPageStreaming(prev.seed, prev.page);
    }
  }
}

async function init(): Promise<void> {
  document.getElementById('nav-left')!.addEventListener('click', handleNavLeft);
  document.getElementById('nav-right')!.addEventListener('click', handleNavRight);
  
  document.addEventListener('keydown', handleKeyDown);
  
  onReferenceClick(handleReferenceClick);
  
  setupPopStateHandler((loc) => {
    navigateTo(loc.seed, loc.page);
  });
  
  let location = parseURL();
  
  if (!location) {
    const seed = await fetchRandomSeed();
    location = { seed, page: 1 };
  }
  
  navigateTo(location.seed, location.page);
}

init();
```

---

## Phase 5: Local Development

### Step 5.1: Start the backend (in one terminal)

```bash
cd backend
npm run dev
```

### Step 5.2: Start the frontend (in another terminal)

```bash
cd frontend
npm run dev
```

### Step 5.3: Open the application

Open your browser to http://localhost:5173

---

## Phase 6: Production Deployment

### Step 6.1: Update backend package.json for production build

Edit `backend/package.json` scripts:

```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "build:frontend": "cd ../frontend && npm run build && cp -r dist ../backend/dist/frontend"
  }
}
```

### Step 6.2: Create Procfile for Railway (optional)

Create file `backend/Procfile`:

```
web: npm start
```

### Step 6.3: Deploy to Railway

Option A: Connect GitHub repository
1. Push your code to GitHub
2. In Railway, click "New" → "GitHub Repo"
3. Select your repository
4. Railway will auto-detect and deploy

Option B: Use Railway CLI
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Step 6.4: Set environment variables in Railway

In your Railway project:
1. Click on your backend service
2. Go to "Variables" tab
3. Add:
   - `ANTHROPIC_API_KEY` = your Anthropic API key
   - `NODE_ENV` = production

The `DATABASE_URL` should be automatically available if you have a PostgreSQL service in the same project.

### Step 6.5: Configure the domain

1. In Railway, click on your backend service
2. Go to "Settings" tab
3. Under "Domains", click "Generate Domain" or add a custom domain

---

## Verification Checklist

After completing all steps, verify:

- [ ] Backend starts without errors (`npm run dev` in backend/)
- [ ] Frontend starts without errors (`npm run dev` in frontend/)
- [ ] Database connection works (check `/health` endpoint)
- [ ] Opening http://localhost:5173 shows a page from a random canonical seed
- [ ] Clicking right side or pressing → flips to next page
- [ ] Clicking left side or pressing ← flips to previous page
- [ ] [[References]] are highlighted and clickable
- [ ] Clicking a reference navigates to that book
- [ ] Pressing Backspace returns to previous book
- [ ] Text streams onto the page when generating new pages
- [ ] Returning to a previously visited page shows the same content

---

## Troubleshooting

### "Cannot find module" errors
Run `npm install` in both `backend/` and `frontend/` directories.

### Database connection errors
- Check that your `DATABASE_URL` in `.env` is correct
- Ensure the database schema has been run
- Check that Railway PostgreSQL is running

### Anthropic API errors
- Verify your `ANTHROPIC_API_KEY` is correct
- Check you have API access to Claude Opus 4.5

### CORS errors
- Ensure the backend is running on port 3000
- Ensure the frontend Vite config has the proxy set up correctly

### Streaming not working
- Check browser console for EventSource errors
- Verify the `/api/page/stream` endpoint returns `text/event-stream` content type

