# The Infinite Book

A boundless library that contains every book that could ever be written. You navigate it by flipping pages and following references. There is no search, no input field, no generation prompt — only the ancient gestures of reading: turning pages and pursuing citations.

Every page exists at a unique address. Once visited, a page is fixed forever. The library exists in potential; your visit collapses it into permanence.

---

## The Concept

### What Is The Infinite Book?

The Infinite Book is a single, unified reading experience that contains all possible books within itself. It is not a collection of books, but *one book* — a book whose pages lead to other pages, whose references open into entire volumes, whose margins contain libraries.

When you open The Infinite Book, you find yourself mid-page, mid-sentence, in some work you've never encountered. You can flip forward to continue reading, flip backward to see what came before, or tap any [[reference]] to be transported to page one of whatever work was cited. That cited work exists — fully, coherently — and contains its own references to still more works. There is no bottom. There is no edge.

### The Core Insight

The Infinite Book is built on a simple observation: books are already full of implicit hyperlinks.

Every footnote that says "See Smith (1987)" is a link. Every bibliography entry is a link. Every mention of "as Marchetti argued in her influential monograph" is a link. Every proper noun — every author, every place, every institution — implies a world of context that could be explored.

In physical books, these links are inert. You cannot follow them without leaving your chair, finding another book, opening it.

The Infinite Book makes these links live. Every reference you encounter can be followed. And when you follow it, you find not a summary, not a stub, but a complete work — one that contains its own living references to further works.

---

## Design Principles

The Infinite Book is constructed according to eight principles that ensure its coherence and infinite explorable depth:

### 1. A Familiar Container Provides the Grammar

The interface is *a book*. Pages. Page numbers. Typography. Margins. The visual and interaction language of reading is universal — everyone knows how to turn a page, how to follow a citation. This familiarity is the scaffolding that makes infinite content navigable.

### 2. Bounded Infinity

The *form* is finite and recognizable (we all know what a book page looks like), but what can *exist* within that form is unbounded. Any seed — any title, any phrase, any name — corresponds to a book. The space of possible books is infinite, but each book, each page, is finite and comprehensible.

### 3. Interaction as Instantiation

Nothing exists until you reach for it. Flipping to a page, tapping a reference — these acts collapse possibility into actuality. The page you're reading didn't exist until someone navigated to it. The act of exploration is the act of creation. But once created, the page is permanent. Return to it tomorrow, next year, from a different device — you will find exactly what was there before.

### 4. Every Output Is Also an Input

This is the recursive property that makes the system truly infinite. Every page you read (an output of the system) contains references (inputs that generate more outputs). A generated book mentions other books. Those books, when visited, mention still more books. The library generates itself as you explore it.

### 5. Self-Similarity at Every Level

Every page has the same structure: prose containing [[references]]. Every reference leads to another book. Every book contains more references. The system is fractal — zoom in on any part and you find the same generative structure. There are no dead ends, no terminal nodes, no edges.

### 6. Coherent Hallucination

The familiar constraint of the book form — its typography, its scholarly apparatus, its prose conventions — ensures that generated content feels *real*. Not random, not chaotic, but as if it belongs to a consistent alternate literary universe. The books feel like they were written, not generated.

### 7. Completeness as Illusion, Coherence as Reality

The library appears complete because any query within its domain — any reference you can tap — leads to a real, full book. But this completeness is an illusion; the content is generated on demand. What is real is the *coherence*: the consistency of style, the mutual citation of works, the sense that these books all belong to the same intellectual tradition.

### 8. The Native Metaphor for Navigation

You don't "prompt" this system. You don't type queries. You *read*, and you *follow*. The navigation metaphor is the one humans have used for millennia: turning pages, pursuing citations, wandering through stacks. The latent space of all possible books is navigated through the same gestures you'd use in a physical library.

---

## How It Works

### The Address System

Every page in The Infinite Book has a unique address consisting of two components:

```
(seed, page_number)
```

- **Seed**: A string that identifies which "book" you're in. This can be a title ("The Lost Books of Tacitus"), an author name ("Dr. Elisabeth Marchetti"), a concept ("The Hermeneutics of Silence"), or any other phrase.

- **Page Number**: A positive integer indicating which page of that book you're on.

For example:
- `("The Lost Books of Tacitus", 1)` — The first page of a book about Tacitus's lost works
- `("The Lost Books of Tacitus", 47)` — The forty-seventh page of that same book
- `("Dr. Elisabeth Marchetti", 1)` — The first page of a book about (or by) Dr. Marchetti

### Navigation

There are exactly three ways to move through The Infinite Book:

1. **Flip Forward**: Move from page N to page N+1 within the same book
2. **Flip Backward**: Move from page N to page N-1 within the same book (cannot go below page 1)
3. **Follow a Reference**: Tap a [[bracketed reference]] to go to page 1 of the book whose seed is the reference text

That's it. No search. No index. No table of contents for the library as a whole. You navigate by reading and following.

### References

Within the prose of any page, you'll find text enclosed in [[double brackets]]. These are references — links to other books in the library. The text inside the brackets becomes the seed for the linked book.

Example passage:
> "The archives at [[the Sonderberg Collection]] contain what remains of [[Marchetti]]'s correspondence with [[the Vermillion Society]]. As [[Dr. Casaubon]] noted in his final lecture, 'We are all reading fragments of the same shattered text.'"

This single paragraph contains four references:
- Tapping "the Sonderberg Collection" takes you to a book about that archive
- Tapping "Marchetti" takes you to a book about or by that person
- Tapping "the Vermillion Society" takes you to a book about that organization
- Tapping "Dr. Casaubon" takes you to a book about or by that scholar

Each of those books contains its own references. The web extends infinitely.

### Permanence

When you visit a page for the first time, you *discover* it. The content is generated at that moment and stored permanently. Every subsequent visitor to that same address sees exactly the same content. The page has become part of the permanent library.

This means:
- You can bookmark pages and return to them
- You can share links with others
- The library accumulates over time as visitors explore
- References between books are stable — if Book A cites Book B, Book B exists and will always contain the same content

### Bidirectional Consistency

Pages must be consistent with their neighbors. If you visit page 5 of a book, and page 4 already exists, page 5 must continue naturally from where page 4 left off. If page 6 already exists, page 5 must lead naturally into page 6's opening.

This ensures that no matter the order in which pages are discovered, the book reads coherently from beginning to end.

---

## The Canonical Seeds

When you first enter The Infinite Book with no specific destination, you are placed at page 1 of a randomly selected canonical seed. These are the traditional entry points to the library, drawn from Borges's description of the Library of Babel:

- The detailed history of the future
- The autobiographies of the archangels
- The faithful catalog of the Library
- Thousands and thousands of false catalogs of the Library
- The proof of the falsity of thousands and thousands of false catalogs of the Library
- A proof of the falsity of the true catalog of the Library
- The gnostic gospel of Basilides
- The commentary upon the gnostic gospel of Basilides
- The commentary on the commentary of the gnostic gospel of Basilides
- The true story of your death
- The translation of every book into every language
- The interpolations of every book into all books
- The treatise Bede could have written (but did not) on the mythology of the Saxon people
- The lost books of Tacitus

From any of these starting points, references lead outward into the infinite library.

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
```

### Generation

When a page is requested that doesn't exist:

1. Check for up to 2 neighboring pages in each direction (N-2, N-1, N+1, N+2)
2. Build an XML-structured prompt with:
   - System context (sent as `system` parameter) describing The Infinite Book
   - Existing pages as context (placed first, per Anthropic best practices)
   - The specific request (seed and page number)
   - Instructions for generation (placed after context)
3. Generate new page content via Claude claude-opus-4-5-20251101 with extended thinking that:
   - Continues from the previous page(s) if they exist
   - Leads into the next page(s) if they exist
   - Contains [[references]] to other works
   - Maintains consistency with the book's seed/title
4. Extract opening, closing, and references
5. Store permanently

### API

- `GET /api/page?seed={seed}&page={number}` — Get or generate a page
- `GET /api/page/stream?seed={seed}&page={number}&referrerSeed={seed}&referrerPage={N}` — Stream page generation (SSE), optional referrer for context
- `GET /api/page/check?seed={seed}&page={number}` — Check if page exists in database
- `GET /api/random-seed` — Get a random canonical seed

### Frontend

The frontend presents a single page at a time, styled to resemble a physical book:

- EB Garamond typography
- Warm paper-colored background
- Page numbers
- Justified text with markdown rendering (headers, emphasis, blockquotes)
- Subtle reference styling (underlined, muted color)
- Keyboard navigation (arrow keys to flip, backspace to go back)
- Click/tap zones on left and right edges to flip
- Streaming text display with live cursor for newly generated pages

---

## The Experience

You open The Infinite Book.

You're mid-page, mid-sentence, in a work you've never seen. Something about archives, correspondence, a society whose name you don't recognize. You read. The prose is dense, scholarly, slightly archaic. Footnotes reference other works.

You flip forward. The argument continues. A new character is introduced — a Dr. Casaubon, who apparently wrote extensively on this topic. His name is bracketed. You tap it.

Suddenly you're on page one of a different book entirely. This one is about Casaubon — or perhaps by him. The style is different. The concerns are different. But there are references here too: to Casaubon's mentors, to his rivals, to the institutions where he worked, to the controversies he was embroiled in.

You follow one of those references. Then another. An hour passes. You're deep in the stacks now, far from where you started, reading about a 17th-century heretical movement that may or may not have existed, described in prose that feels genuinely old, citing sources that you could follow but haven't yet.

You bookmark the page. You'll come back tomorrow. When you do, it will be exactly as you left it.

The library is patient. It will wait.

---

## Project Structure

```
library-of-babel/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express server entry point
│   │   ├── types.ts              # TypeScript type definitions
│   │   ├── routes/
│   │   │   └── pages.ts          # API route handlers
│   │   ├── services/
│   │   │   ├── database.ts       # PostgreSQL operations
│   │   │   ├── llm.ts            # Claude API integration
│   │   │   └── pageGenerator.ts  # Page generation logic
│   │   └── prompts/
│   │       └── templates.ts      # LLM prompt construction
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── index.html            # Single page HTML
│   │   ├── styles.css            # Book styling (with markdown support)
│   │   ├── app.ts                # Main application logic
│   │   ├── navigation.ts         # History and URL management
│   │   ├── renderer.ts           # Page rendering with markdown (via marked)
│   │   └── types.ts              # TypeScript types
│   ├── vite.config.ts
│   └── package.json
├── database/
│   └── schema.sql                # PostgreSQL schema
├── APP_SETUP.md                  # Step-by-step setup instructions
└── README.md                     # This file
```

---

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: Vite, TypeScript, vanilla JS, marked (markdown rendering)
- **Database**: PostgreSQL
- **AI**: Claude claude-opus-4-5-20251101 via Anthropic API (with extended thinking enabled)
- **Styling**: EB Garamond font, CSS with full markdown support

---

## Quick Start (Local Development)

```bash
# 1. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 2. Set up environment
cp backend/.env.example backend/.env
# Edit .env with your DATABASE_URL and ANTHROPIC_API_KEY

# 3. Initialize database
psql $DATABASE_URL -f database/schema.sql

# 4. Start development servers (in separate terminals)
cd backend && npm run dev      # Runs on port 3000
cd frontend && npm run dev     # Runs on port 5173 with proxy to backend
```

---

## Getting Started

See [APP_SETUP.md](./APP_SETUP.md) for detailed, step-by-step setup instructions.

---

## License

MIT

