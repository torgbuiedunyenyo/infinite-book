# The Infinite Book

A boundless library centered on one story. You navigate by flipping pages and following [[references]]. No search, no prompts—only the ancient gestures of reading.

Every page exists at a unique address. Once visited, a page is fixed forever.

---

## The Story: The Shape of Time

All readers enter through **"The Shape of Time"**—Jay's story. This is the core narrative, and it has a predefined arc:

**Jay** works at a shop in 2025 Oakland, in an era shaped by future influence. He meets **Tan**, a wealthy woman from ~2150, when she can't figure out his phone. They fall in love despite an enormous power gap.

When Tan brings Jay to the future and then disappears, he's immediately suspected. He flees across eras, learns to navigate time, and eventually finds her at the Mystas edges—where she'd gone on an adventure without considering the consequences for him.

Jay forgives her. But Tan doesn't want to continue the relationship. He returns to Oakland, different now, but back where he started.

### The World

Time has three dimensions: Primas (past/future), Phantas (adjacent), Mystas (unmapped edges). **PRMTTs** enable time travel. The future exploits the past through tourism, resource extraction, and labor arbitrage. Past people in the future face prejudice and immigration controls.

### Inset Narratives

When you click a [[reference]], you enter an **inset narrative**—a book that explores that element of the world. Insets don't need to feature Jay/Tan, but they exist in the same world and must never contradict established facts.

---

## How It Works

### Navigation
- **Flip pages**: Arrow keys or swipe
- **Follow references**: Click [[bracketed text]] → page 1 of that book
- **History**: Backspace to return
- **Library sidebar**: Hamburger menu (top-left) to browse discovered books

### Consistency Systems

| Layer | What | When |
|-------|------|------|
| **Core Arc** | Predefined 6-part narrative for "The Shape of Time" | Always |
| **Inset Arcs** | Model-generated narrative DNA (150-250 words) | Page 1 |
| **Chunk Summaries** | 5-page factual summaries | Pages 5, 10, 15... |
| **Running Summary** | Current momentum + pacing awareness | Pages 5, 10, 15... |
| **Canonical Facts** | Cross-book consistency with priority levels | Every page |
| **Sliding Window** | Full text of 3 previous pages | Every page |

### Fact Priority System
- **Priority 3**: Core narrative facts (Jay, Tan, key events)—always included
- **Priority 2**: Major world elements (PRMTTs, the edges, underground)
- **Priority 1**: Other details

---

## Quick Start

```bash
# Install
cd backend && npm install
cd ../frontend && npm install

# Configure
cp backend/.env.example backend/.env
# Add DATABASE_URL and ANTHROPIC_API_KEY

# Database
psql $DATABASE_URL -f database/schema.sql
for f in database/migrations/*.sql; do psql $DATABASE_URL -f "$f"; done

# Run
cd backend && npm run dev      # Port 3000
cd frontend && npm run dev     # Port 5173
```

---

## Environment Variables

Create `backend/.env` with:

```bash
# Required
DATABASE_URL=postgresql://postgres:password@localhost:5432/infinite_book
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional
PORT=3000
LOG_LEVEL=debug  # debug, info, warn, error
NODE_ENV=development

# Langfuse (LLM Observability - optional)
LANGFUSE_SECRET_KEY=sk-lf-your-secret-key
LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key
LANGFUSE_BASE_URL=https://us.cloud.langfuse.com
```

---

## Tech Stack

- **Backend**: Node.js, Express 5, TypeScript
- **Frontend**: Vite, TypeScript, vanilla JS
- **Database**: PostgreSQL
- **AI**: Claude Opus 4.5 with extended thinking (15k token budget)
- **Styling**: EB Garamond, warm paper aesthetic
- **Observability**: Langfuse (optional, for tracing and evaluation)

---

## Project Structure

```
library-of-babel/
├── backend/src/
│   ├── index.ts                    # Express server, middleware, health checks
│   ├── types.ts                    # TypeScript interfaces, seed normalization
│   ├── prompts/
│   │   └── templates.ts            # World essence, core arc, prompt building
│   ├── services/
│   │   ├── pageGenerator.ts        # Generation orchestration, streaming, caching
│   │   ├── summaryService.ts       # Arcs, chunks, momentum (hierarchical context)
│   │   ├── factsService.ts         # Priority-based fact extraction
│   │   ├── evaluationService.ts    # Quality assessment (discrete + LLM-as-judge)
│   │   ├── database.ts             # PostgreSQL operations
│   │   ├── llm.ts                  # Claude Opus 4.5 integration
│   │   ├── langfuse.ts             # LLM observability integration
│   │   └── logger.ts               # Structured logging
│   ├── routes/
│   │   └── pages.ts                # API endpoints
│   └── scripts/
│       ├── pregenerate.ts          # Batch page pre-generation
│       ├── batchEvaluate.ts        # Batch quality evaluation
│       └── langfuseCheck.ts        # Langfuse connectivity test
│
├── frontend/src/
│   ├── app.ts                      # Navigation, aggressive pre-generation
│   ├── renderer.ts                 # Page display, streaming, markdown
│   ├── navigation.ts               # URL routing, history management
│   ├── sidebar.ts                  # Library browser
│   ├── tour.ts                     # First-time onboarding
│   ├── swipe.ts                    # Mobile touch navigation
│   ├── logger.ts                   # Frontend logging
│   ├── types.ts                    # Frontend TypeScript interfaces
│   ├── styles.css                  # Book aesthetic, sidebar, tour
│   └── index.html                  # Entry point
│
├── database/
│   ├── schema.sql                  # Complete schema (for fresh installs)
│   └── migrations/                 # Incremental migrations (001-008)
│       ├── 001_add_canonical_facts.sql
│       ├── 006_hierarchical_summaries.sql
│       ├── 007_add_generation_prompt.sql
│       ├── 007_narrative_restructure.sql
│       └── 008_normalize_seeds.sql
│
└── .cursor/rules/
    └── claude-opus-4-5.mdc         # Claude API documentation
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/page` | GET | Get or generate a page (`?seed=...&page=N`) |
| `/api/page/stream` | GET | Stream page generation via SSE |
| `/api/page/check` | GET | Check if page exists (`?seed=...&page=N`) |
| `/api/page/highest` | GET | Get highest page number for seed |
| `/api/books` | GET | List all discovered books |
| `/api/random-seed` | GET | Get a random canonical seed |
| `/api/stats` | GET | Server statistics |
| `/health` | GET | Health check with database status |

---

## Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `pages` | All generated pages (content, references, prompt, referrer) |
| `canonical_facts` | Extracted facts for cross-book consistency |
| `book_narrative_arcs` | Story DNA for each book (narrative arc, mode) |
| `running_summaries` | Current momentum for each book |
| `chunk_summaries` | 5-page segment summaries |

### Migrations

Run migrations in order for existing databases:

```bash
for f in database/migrations/*.sql; do psql $DATABASE_URL -f "$f"; done
```

For fresh installs, `schema.sql` contains the complete current state.

---

## Evaluation System

The system includes comprehensive quality evaluation via Langfuse:

### Discrete Evaluations (fast, rule-based)
- Reference count and target range (1-2)
- Word count and target range (200-300)
- No meta-commentary (headers, author notes)
- No forbidden time travel tropes (loops, paradoxes)
- Sentence variety, dialogue presence

### Qualitative Evaluations (LLM-as-judge)
- **Craft**: Show-don't-tell, prose immersion
- **Structure**: Forward momentum, tension presence
- **World**: Temporal mechanics consistency, no mystical weirdness, power dynamics
- **Coherence**: Voice consistency, emotional authenticity, reference quality

---

## Access Control

Pages are discovered through natural exploration:

1. **Sequential access**: Page N requires page N-1 to exist
2. **Reference-based creation**: New books can only be created by clicking [[references]] in existing pages
3. **Canonical seeds**: "The Shape of Time" is accessible directly

This prevents arbitrary URL manipulation from creating incoherent pages.

---

## Pre-generation

The frontend aggressively pre-generates content:

- **3 pages ahead** in the current book
- **Pages 1-2** of all [[references]] on the current page
- **Queue system** with priority (upcoming pages > references)
- **Max 3 concurrent** pre-generation requests

This ensures readers rarely see loading screens.

---

## Seed Normalization

All seeds are normalized to Title Case for consistency:

| Input | Output |
|-------|--------|
| `clef` | `Clef` |
| `the shop` | `The Shop` |
| `PRMTTs` | `PRMTTs` (preserved - acronym) |
| `the underground` | `The Underground` |

---

## Scripts

```bash
# Pre-generate pages for a seed
cd backend && npx ts-node src/scripts/pregenerate.ts "The Shape of Time" 10

# Run batch evaluation on existing pages
cd backend && npx ts-node src/scripts/batchEvaluate.ts

# Check Langfuse connectivity
cd backend && npx ts-node src/scripts/langfuseCheck.ts
```

---

## Production Build

```bash
# Build everything
npm run build

# This creates:
# - backend/dist/          (compiled backend)
# - backend/dist/frontend/ (bundled frontend)

# Run in production
NODE_ENV=production npm start
```

---

## License

MIT
