# The Infinite Book

A boundless library that contains every book that could ever be written. You navigate it by flipping pages and following references. There is no search, no input field, no generation prompt — only the ancient gestures of reading: turning pages and pursuing references.

Every page exists at a unique address. Once visited, a page is fixed forever. The library exists in potential; your visit collapses it into permanence.

---

## The World: The Shape of Time

All books in The Infinite Book take place within a single, cohesive world—a science fiction setting where time is three-dimensional.

### The Nature of Time

Time has three dimensions, just as space does—two ways humans perceive a single phenomenon:

- **Primas**: Primas Major ("past") and Primas Minor ("future"). The familiar axis; most travel occurs here.
- **Phantas**: Times along this axis feel "adjacent" rather than before or after.
- **Mystas**: The least explored axis. The edges of known time along Mystas are unmapped and dangerous.

**Core properties:**
- All times exist simultaneously. The "present" is just where you happen to be.
- Causation is omnidirectional. The past shapes the future; the future shapes the past. This means things can exist in a time because a later time's demand for them caused them to.
- Time is self-healing. Disturbances fade rather than amplify, like ripples in water.
- No body duplication. There is only one of you across all of time.
- Movement through time ages you regardless of direction.

### The Setting

**PRMTTs** (Prostheses for Rapid Movement Through Time) accelerate movement along temporal axes. By 2150, they're compact manufactured devices, ubiquitous among those who can afford them.

**Temporal mapping** charts the currents and flows of time. The major PRMTT companies control the most comprehensive maps, giving them power over who travels where.

The future is wealthier than the past. Resources depleted in the future are extracted from past eras; future tourists visit past times for the experience; future money flows into past economies and reshapes them.

At the far edges of the Mystas axis, beyond mapped time, something is growing—a region where time's self-healing has reversed, disturbances amplify, and travelers risk becoming temporally incoherent.

### One Central Narrative

The library contains many stories, but one threads through much of it—illustrating how this world feels to live in:

**Jay** works at a shop in 2025 Oakland, in an era shaped by future influence. He meets **Tan**, a wealthy woman from around 2150, when she can't figure out his phone. They fall in love despite an enormous power gap—she has money, status, temporal fluency; he has none of these.

When Tan brings Jay to the future and then disappears, Jay is immediately suspected. He flees across eras, learns to navigate time through study and necessity, and eventually finds Tan at the Mystas edges where she'd gone on an adventure without considering the consequences for him.

Jay forgives her. But Tan doesn't want to continue the relationship. He returns to Oakland, to his shop—different now, but back where he started.

*Not every book features Jay and Tan—but every book exists in the same world, and their story provides gravitational context.*

---

## The Concept

### What Is The Infinite Book?

The Infinite Book is a single, unified reading experience that contains all possible books within itself. When you open it, you find yourself mid-page, mid-sentence, in some work you've never encountered. You can flip forward, flip backward, or tap any [[reference]] to be transported to page one of whatever work was cited.

### The Core Insight

Books are already full of implicit hyperlinks. Every mention of a character, place, or concept implies a world of context. The Infinite Book makes these links live. Every reference you encounter can be followed, leading to a complete work containing its own references to further works. There is no bottom. There is no edge.

---

## Design Principles

1. **A Familiar Container**: The interface is *a book*—pages, typography, margins. Everyone knows how to turn a page.

2. **Bounded Infinity**: The form is finite (a book page), but what can exist within it is unbounded.

3. **Every Output Is Also an Input**: Every page contains references that generate more pages. The library generates itself as you explore.

4. **Self-Similarity**: Every page has the same structure—prose containing [[references]]. The system is fractal.

5. **Coherent World**: All books exist within The Shape of Time. Generated content feels real because it belongs to a consistent fictional universe.

6. **Completeness as Illusion, Coherence as Reality**: The library appears complete because any reference leads to a real book. What's real is the consistency.

7. **Native Navigation**: You don't prompt the system. You *read* and you *follow*.

---

## How It Works

### The Address System

Every page has a unique address:

```
(seed, page_number)
```

- **Seed**: A string identifying the "book" (a title, character name, place, or any phrase)
- **Page Number**: A positive integer

### Navigation

Three ways to move:

1. **Flip Forward**: Page N → Page N+1
2. **Flip Backward**: Page N → Page N-1 (minimum page 1)
3. **Follow a Reference**: Tap [[bracketed text]] → Page 1 of that book

### References

Text in [[double brackets]] are links to other books:

> "[[Jay]] had seen the currents shift before, but never like this. The readings from [[Meridian Station]] suggested something was wrong at [[the edges]]."

### Permanence

When you visit a page for the first time, you *discover* it. The content is generated and stored permanently. Every subsequent visitor sees the same content.

### Sequential Discovery

Pages must be discovered in order. You cannot skip ahead—page 5 can only exist after pages 1-4 have been discovered. This ensures the library grows organically through actual reading, not through URL manipulation or automated crawling.

New books can only be created in two ways:
1. **Starting from a canonical seed** (curated entry points into the world)
2. **Following a [[reference]]** from an existing page

This means the library's expansion is driven entirely by the reading experience. Every book that exists was discovered by following the natural pathways of the text.

### Consistency Systems

The library maintains consistency through a layered approach:

#### World Layer (Cross-Book Coherence)

**Canonical Facts Database**: Established details about characters, places, events, and concepts are extracted from every page and stored. When new pages are created, up to 12 relevant facts are retrieved to ensure world consistency.

**Same-Book Fact Priority**: Facts are retrieved in two stages—first from the current book (up to 6), then cross-book facts via full-text search (remaining slots). This ensures a book never "forgets" its own established details.

**Seed Sovereignty**: The seed determines what each book is about. A book titled "Meridian Station" focuses on that station; Jay and Tan appear only if they'd naturally be there. The central narrative is context, not prescription.

#### Book Layer (Narrative Identity)

**Book Synopses**: When page 1 of any book is generated, the system extracts a synopsis capturing:
- What the book is about (2-3 sentences)
- The narrative mode (character, place, document, event, or concept)
- The opening situation established on page 1

**Rolling Synopsis Updates**: Every 5 pages, the synopsis is updated to reflect where the story is NOW, not just where it started. This prevents storyline drift in longer books.

#### Page Layer (Immediate Context)

**Sequential Page Continuity**: When generating page N, the system retrieves up to 2 previous pages (N-2 and N-1) to provide context. The new page continues naturally from where the previous page left off.

**Story Events**: 1-3 events are extracted from each page (actions, discoveries, decisions). When generating new pages, the system includes:
- Recent events (last 4 pages)
- Key events from earlier pages (turning points, revelations)

This prevents repetition (the model won't have Jay give Tan clef on page 2 AND page 8) while preserving important early plot beats.

#### Origin Layer (New Book Context)

**Referrer Context**: When a new book is created by following a [[reference]], the referrer page's content is included so the model understands what the reference means in context.

---

## The Canonical Seeds

Entry points to the library—doorways into The Shape of Time. These are the only seeds that can be accessed directly; all other books must be discovered by following [[references]].

The canonical seeds are time-related idioms, each opening into the world of The Shape of Time:

- Out of Time
- On Time
- Ahead of Time
- For The Time Being
- From Time to Time
- In No Time
- Saving Time
- Time Wasted
- Time After Time
- About Time
- Killing Time
- Time Flies
- Time Will Tell
- Buying Time

---

## Technical Architecture

### Data Model

```
Page {
  seed: string           // The book identifier
  page_number: integer   // Which page (1-indexed)
  content: string        // The prose content
  opening: string        // First ~50 words (for continuity)
  closing: string        // Last ~50 words (for continuity)
  references: array      // Extracted [[references]]
  discovered_at: timestamp
}

CanonicalFact {
  category: string       // 'character', 'place', 'event', 'object', 'relationship'
  name: string           // The entity name
  fact: string           // The established fact
  source_seeds: array    // Which books established this fact
}

BookSynopsis {
  seed: string           // The book identifier
  synopsis: string       // 2-3 sentence summary (from page 1)
  updated_synopsis: string // Current synopsis (updated every 5 pages)
  narrative_mode: string // 'character', 'place', 'document', 'event', 'concept'
  opening_situation: string // One-sentence scene description
  last_updated_page: integer // When synopsis was last updated
}

StoryEvent {
  seed: string           // The book identifier
  page_number: integer   // Which page this event occurred on
  event: string          // One-sentence description of what happened
  significance: string   // 'key' (turning point) or 'minor' (ongoing action)
  entities: array        // Character/place names involved
}
```

### Generation

When a page is requested that doesn't exist:

1. **Access control validation:**
   - For page N > 1: verify page N-1 exists
   - For page 1 of non-canonical seeds: verify referrer contains [[this seed]] as a reference
2. Retrieve up to 2 previous pages for continuity context
3. Retrieve relevant canonical facts (same-book first, then cross-book via FTS, up to 12 total)
4. Retrieve story events (recent events + key events from earlier, up to 10 total)
5. For pages > 1: retrieve book synopsis (preferring updated synopsis) and page 1 opening
6. Build a structured prompt with world essence, context, and guidelines
7. Generate via Claude Opus 4.5 with extended thinking
8. Extract opening, closing, and references
9. Store permanently
10. Background tasks:
    - Extract canonical facts
    - Extract story events (1-3 per page)
    - Generate book synopsis (page 1 only)
    - Update synopsis (every 5 pages)

### API

**Page Access:**
- `GET /api/page?seed={seed}&page={number}` — Get or generate a page
- `GET /api/page/stream?seed={seed}&page={number}` — Stream generation (SSE)
- `GET /api/page/check?seed={seed}&page={number}` — Check if page exists
- `GET /api/page/highest?seed={seed}` — Get highest existing page number for a seed

**Library:**
- `GET /api/random-seed` — Get a random canonical seed
- `GET /api/books` — Get all discovered books
- `GET /api/stats` — System statistics

**Access Control:**

Generation requests enforce sequential discovery:
- Page N requires page N-1 to exist (returns `422` if violated)
- New seeds require valid referrer context via `referrerSeed` and `referrerPage` query params
- Canonical seeds can be accessed without a referrer

Error responses:
- `422 sequential_access_required` — Tried to access page N before page N-1 exists
- `422 invalid_seed_access` — Tried to create a new book without following a reference

### Frontend

A single page at a time, styled as a physical book:

- EB Garamond typography
- Warm paper-colored background
- Subtle [[reference]] styling
- Keyboard navigation (arrows to flip, backspace for history)
- Streaming text with cursor for new pages
- Library sidebar with search

---

## Project Structure

```
library-of-babel/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express server
│   │   ├── types.ts              # TypeScript types
│   │   ├── routes/
│   │   │   └── pages.ts          # API handlers
│   │   ├── services/
│   │   │   ├── database.ts       # PostgreSQL operations
│   │   │   ├── bookService.ts    # Book synopsis generation & updates
│   │   │   ├── eventsService.ts  # Story event extraction
│   │   │   ├── factsService.ts   # Canonical facts extraction
│   │   │   ├── llm.ts            # Claude API integration
│   │   │   ├── logger.ts         # Structured logging
│   │   │   └── pageGenerator.ts  # Page generation orchestration
│   │   └── prompts/
│   │       └── templates.ts      # LLM prompts with world essence
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── index.html
│   │   ├── styles.css
│   │   ├── app.ts
│   │   ├── navigation.ts
│   │   ├── renderer.ts
│   │   ├── sidebar.ts
│   │   ├── logger.ts
│   │   └── types.ts
│   ├── vite.config.ts
│   └── package.json
├── database/
│   ├── schema.sql
│   └── migrations/
│       ├── 001_add_canonical_facts.sql
│       ├── 002_add_book_synopses.sql
│       ├── 003_remove_citations.sql
│       ├── 004_add_story_events.sql
│       └── 005_add_synopsis_updates.sql
└── README.md
```

---

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: Vite, TypeScript, vanilla JS, marked
- **Database**: PostgreSQL
- **AI**: Claude Opus 4.5 (page generation) + Claude Sonnet 4.5 (synopsis/fact extraction)
- **Styling**: EB Garamond font, CSS

---

## Quick Start

```bash
# 1. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 2. Set up environment
cp backend/.env.example backend/.env
# Edit .env with DATABASE_URL and ANTHROPIC_API_KEY

# 3. Initialize database
psql $DATABASE_URL -f database/schema.sql

# 4. Run migrations
psql $DATABASE_URL -f database/migrations/001_add_canonical_facts.sql
psql $DATABASE_URL -f database/migrations/002_add_book_synopses.sql
psql $DATABASE_URL -f database/migrations/003_remove_citations.sql
psql $DATABASE_URL -f database/migrations/004_add_story_events.sql
psql $DATABASE_URL -f database/migrations/005_add_synopsis_updates.sql

# 5. Start development servers
cd backend && npm run dev      # Port 3000
cd frontend && npm run dev     # Port 5173
```

---

## The Experience

You open The Infinite Book.

You're mid-page, mid-sentence. Someone named Jay is running. There's mention of "the currents" and something called "Meridian Station." A woman named Tan appears.

You flip forward. A reference to "the edges" is bracketed. You tap it.

You're on page one of a different book—about the Mystas, where time grows thin. References here too: to those who live at the edges, to the dark thing, to the Company that controls the routes.

You follow one reference. Then another. An hour passes. You're deep in the library now, reading about temporal colonialism in prose that feels genuinely lived-in.

You bookmark the page. You'll come back tomorrow. It will be exactly as you left it.

The library is patient. It will wait.

---

## License

MIT
