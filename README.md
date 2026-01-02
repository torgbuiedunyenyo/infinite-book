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

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: Vite, TypeScript, vanilla JS
- **Database**: PostgreSQL
- **AI**: Claude Opus 4.5 with extended thinking
- **Styling**: EB Garamond, warm paper aesthetic

---

## Project Structure

```
library-of-babel/
├── backend/src/
│   ├── prompts/templates.ts   # World essence, core arc, prompt building
│   ├── services/
│   │   ├── pageGenerator.ts   # Generation orchestration
│   │   ├── summaryService.ts  # Arcs, chunks, momentum
│   │   ├── factsService.ts    # Priority-based fact extraction
│   │   └── database.ts        # PostgreSQL operations
│   └── routes/pages.ts        # API endpoints
├── frontend/src/
│   ├── app.ts                 # Navigation, pre-generation
│   ├── renderer.ts            # Page display, streaming
│   └── styles.css             # Book aesthetic
└── database/migrations/       # 001-007
```

---

## License

MIT
