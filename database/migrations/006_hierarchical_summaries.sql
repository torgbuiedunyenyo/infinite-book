-- Migration: 006_hierarchical_summaries.sql
-- Replaces fragmented synopsis/event systems with hierarchical summaries
-- 
-- BREAKING CHANGE: This migration drops book_synopses and story_events tables
-- after creating new tables. Run with caution on production data.

-- ==================== NEW TABLES ====================

-- Book Narrative Arc: The story's DNA, created from page 1
-- Replaces: book_synopses (synopsis, opening_situation, narrative_mode)
CREATE TABLE IF NOT EXISTS book_narrative_arcs (
    id SERIAL PRIMARY KEY,
    seed TEXT UNIQUE NOT NULL,
    narrative_arc TEXT NOT NULL,       -- 150-250 words: protagonist, tension, trajectory, themes
    narrative_mode TEXT NOT NULL,      -- 'character', 'place', 'document', 'event', 'concept'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_book_narrative_arcs_seed ON book_narrative_arcs(seed);

COMMENT ON TABLE book_narrative_arcs IS 'Rich narrative DNA for each book, guiding all future page generation';
COMMENT ON COLUMN book_narrative_arcs.narrative_arc IS '150-250 word document: protagonist, central tension, trajectory, themes, world connections';
COMMENT ON COLUMN book_narrative_arcs.narrative_mode IS 'Type of narrative: character, place, document, event, or concept';


-- Running Summary: Current story momentum, updated every 5 pages
-- Tracks WHERE the story IS NOW, not its history
CREATE TABLE IF NOT EXISTS running_summaries (
    id SERIAL PRIMARY KEY,
    seed TEXT UNIQUE NOT NULL,
    momentum TEXT NOT NULL,            -- 75-125 words: current tensions, character positions, direction
    last_updated_page INTEGER NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_running_summaries_seed ON running_summaries(seed);

COMMENT ON TABLE running_summaries IS 'Current story momentum - updated at pages 5, 10, 15, 20...';
COMMENT ON COLUMN running_summaries.momentum IS '75-125 words about current state: active tensions, character positions, thematic direction';


-- Chunk Summaries: Factual summaries of 5-page segments
-- Replaces: story_events (which had broken selection algorithm)
CREATE TABLE IF NOT EXISTS chunk_summaries (
    id SERIAL PRIMARY KEY,
    seed TEXT NOT NULL,
    chunk_start INTEGER NOT NULL,      -- First page of chunk (1, 6, 11, 16...)
    chunk_end INTEGER NOT NULL,        -- Last page of chunk (5, 10, 15, 20...)
    summary TEXT NOT NULL,             -- 75-125 words: key events, character developments, plot progressions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_chunk UNIQUE (seed, chunk_start)
);

CREATE INDEX IF NOT EXISTS idx_chunk_summaries_seed ON chunk_summaries(seed);
CREATE INDEX IF NOT EXISTS idx_chunk_summaries_seed_end ON chunk_summaries(seed, chunk_end);

COMMENT ON TABLE chunk_summaries IS 'Factual summaries of 5-page story segments for complete coverage';
COMMENT ON COLUMN chunk_summaries.summary IS '75-125 words: key events, character developments, plot progressions in this chunk';


-- ==================== DROP OLD TABLES ====================
-- These are replaced by the new hierarchical system

DROP TABLE IF EXISTS book_synopses CASCADE;
DROP TABLE IF EXISTS story_events CASCADE;


-- ==================== VERIFICATION ====================
-- Uncomment to verify migration:
-- SELECT 'book_narrative_arcs' as table_name, count(*) FROM book_narrative_arcs
-- UNION ALL SELECT 'running_summaries', count(*) FROM running_summaries  
-- UNION ALL SELECT 'chunk_summaries', count(*) FROM chunk_summaries;

