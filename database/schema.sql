-- The Infinite Book Database Schema
-- PostgreSQL

-- ==================== PAGES ====================
-- Stores all generated pages in the library

CREATE TABLE pages (
    id SERIAL PRIMARY KEY,
    seed TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    opening TEXT NOT NULL,
    closing TEXT NOT NULL,
    "references" JSONB DEFAULT '[]'::jsonb,
    citations JSONB DEFAULT '[]'::jsonb,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_seed_page UNIQUE (seed, page_number)
);

CREATE INDEX idx_pages_seed ON pages(seed);
CREATE INDEX idx_pages_seed_page ON pages(seed, page_number);


-- ==================== CANONICAL FACTS ====================
-- Stores established facts extracted from generated pages
-- These facts ensure cross-book consistency in the world

CREATE TABLE canonical_facts (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('character', 'place', 'event', 'object', 'relationship')),
    name TEXT NOT NULL,
    fact TEXT NOT NULL,
    source_seeds JSONB DEFAULT '[]'::jsonb,  -- Array of seeds that established/referenced this fact
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Each fact should be unique by category + name
    CONSTRAINT unique_category_name UNIQUE (category, name)
);

CREATE INDEX idx_canonical_facts_category ON canonical_facts(category);
CREATE INDEX idx_canonical_facts_name ON canonical_facts(name);

-- Full-text search index for finding relevant facts
CREATE INDEX idx_canonical_facts_search ON canonical_facts USING gin(to_tsvector('english', name || ' ' || fact));


-- ==================== BOOK SYNOPSES ====================
-- Stores book-level metadata generated from page 1
-- Used to maintain narrative coherence across pages

CREATE TABLE book_synopses (
    id SERIAL PRIMARY KEY,
    seed TEXT NOT NULL UNIQUE,
    
    -- Generated when page 1 is created
    synopsis TEXT NOT NULL,           -- 2-3 sentence summary of what this book is
    narrative_mode TEXT,              -- 'character', 'place', 'document', 'event', 'concept'
    opening_situation TEXT,           -- The specific scene/moment page 1 establishes
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_book_synopses_seed ON book_synopses(seed);

-- Comments for documentation
COMMENT ON TABLE pages IS 'All generated pages in the infinite library';
COMMENT ON TABLE canonical_facts IS 'Established facts about the world, extracted from pages for cross-book consistency';
COMMENT ON TABLE book_synopses IS 'Book-level metadata for maintaining narrative coherence across pages';
COMMENT ON COLUMN book_synopses.synopsis IS '2-3 sentence summary of what this book is about, generated from page 1';
COMMENT ON COLUMN book_synopses.narrative_mode IS 'Type of narrative: character, place, document, event, or concept';
COMMENT ON COLUMN book_synopses.opening_situation IS 'One sentence describing the specific scene/moment established on page 1';
