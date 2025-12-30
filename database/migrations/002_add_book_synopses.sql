-- Migration: Add book_synopses table for narrative coherence
-- This table stores book-level metadata generated from page 1

CREATE TABLE IF NOT EXISTS book_synopses (
    id SERIAL PRIMARY KEY,
    seed TEXT NOT NULL UNIQUE,
    
    -- Generated when page 1 is created
    synopsis TEXT NOT NULL,           -- 2-3 sentence summary of what this book is
    narrative_mode TEXT,              -- 'character', 'place', 'document', 'event', 'concept'
    opening_situation TEXT,           -- The specific scene/moment page 1 establishes
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_book_synopses_seed ON book_synopses(seed);

-- Add comment for documentation
COMMENT ON TABLE book_synopses IS 'Book-level metadata for maintaining narrative coherence across pages';
COMMENT ON COLUMN book_synopses.synopsis IS '2-3 sentence summary of what this book is about, generated from page 1';
COMMENT ON COLUMN book_synopses.narrative_mode IS 'Type of narrative: character, place, document, event, or concept';
COMMENT ON COLUMN book_synopses.opening_situation IS 'One sentence describing the specific scene/moment established on page 1';


