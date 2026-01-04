-- The Infinite Book Database Schema
-- PostgreSQL
-- 
-- This schema reflects the current state after all migrations (001-008).
-- For fresh installs, run this file. For existing databases, run migrations.

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
    generation_prompt TEXT,                          -- Complete prompt (system + user) sent to Claude
    referrer_seed TEXT,                              -- Seed of page that linked here
    referrer_page INTEGER,                           -- Page number that linked here
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_seed_page UNIQUE (seed, page_number)
);

CREATE INDEX idx_pages_seed ON pages(seed);
CREATE INDEX idx_pages_seed_page ON pages(seed, page_number);

COMMENT ON TABLE pages IS 'All generated pages in the infinite library';
COMMENT ON COLUMN pages.seed IS 'Book title/identifier (Title Case normalized)';
COMMENT ON COLUMN pages.page_number IS 'Sequential page number within the book (1-indexed)';
COMMENT ON COLUMN pages.content IS 'Full page content including [[references]]';
COMMENT ON COLUMN pages.opening IS 'First ~50 words for preview';
COMMENT ON COLUMN pages.closing IS 'Last ~50 words for preview';
COMMENT ON COLUMN pages."references" IS 'JSON array of {text, seed} objects for [[references]]';
COMMENT ON COLUMN pages.generation_prompt IS 'The complete prompt (system + user) sent to Claude when generating this page';
COMMENT ON COLUMN pages.referrer_seed IS 'Seed of the page that contained the reference that led to this page (page 1 only)';
COMMENT ON COLUMN pages.referrer_page IS 'Page number of the referrer page (page 1 only)';


-- ==================== CANONICAL FACTS ====================
-- Stores established facts extracted from generated pages
-- These facts ensure cross-book consistency in the world

CREATE TABLE canonical_facts (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('character', 'place', 'event', 'object', 'relationship')),
    name TEXT NOT NULL,
    fact TEXT NOT NULL,
    source_seeds JSONB DEFAULT '[]'::jsonb,          -- Array of seeds that established/referenced this fact
    priority INTEGER DEFAULT 1,                       -- 3=core narrative, 2=major world, 1=details
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_category_name UNIQUE (category, name)
);

CREATE INDEX idx_canonical_facts_category ON canonical_facts(category);
CREATE INDEX idx_canonical_facts_name ON canonical_facts(name);
CREATE INDEX idx_canonical_facts_priority ON canonical_facts(priority DESC);
CREATE INDEX idx_canonical_facts_search ON canonical_facts USING gin(to_tsvector('english', name || ' ' || fact));

COMMENT ON TABLE canonical_facts IS 'Established facts about the world, extracted from pages for cross-book consistency';
COMMENT ON COLUMN canonical_facts.category IS 'Type: character, place, event, object, or relationship';
COMMENT ON COLUMN canonical_facts.name IS 'Entity name this fact is about';
COMMENT ON COLUMN canonical_facts.fact IS 'Single concrete fact sentence';
COMMENT ON COLUMN canonical_facts.source_seeds IS 'JSON array of book seeds that established this fact';
COMMENT ON COLUMN canonical_facts.priority IS 'Fact importance: 3=core narrative, 2=major world, 1=details';


-- ==================== BOOK NARRATIVE ARCS ====================
-- The story's DNA, created from page 1
-- Guides all future page generation for a book

CREATE TABLE book_narrative_arcs (
    id SERIAL PRIMARY KEY,
    seed TEXT UNIQUE NOT NULL,
    narrative_arc TEXT NOT NULL,                     -- 150-250 words: protagonist, tension, trajectory, themes
    narrative_mode TEXT NOT NULL,                    -- 'character', 'place', 'document', 'event', 'concept'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_book_narrative_arcs_seed ON book_narrative_arcs(seed);

COMMENT ON TABLE book_narrative_arcs IS 'Rich narrative DNA for each book, guiding all future page generation';
COMMENT ON COLUMN book_narrative_arcs.seed IS 'Book title/identifier (Title Case normalized)';
COMMENT ON COLUMN book_narrative_arcs.narrative_arc IS '150-250 word document: protagonist, central tension, trajectory, themes, world connections';
COMMENT ON COLUMN book_narrative_arcs.narrative_mode IS 'Type of narrative: character, place, document, event, or concept';


-- ==================== RUNNING SUMMARIES ====================
-- Current story momentum, updated every 5 pages
-- Tracks WHERE the story IS NOW, not its history

CREATE TABLE running_summaries (
    id SERIAL PRIMARY KEY,
    seed TEXT UNIQUE NOT NULL,
    momentum TEXT NOT NULL,                          -- 75-125 words: current tensions, character positions, direction
    last_updated_page INTEGER NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_running_summaries_seed ON running_summaries(seed);

COMMENT ON TABLE running_summaries IS 'Current story momentum - updated at pages 5, 10, 15, 20...';
COMMENT ON COLUMN running_summaries.seed IS 'Book title/identifier (Title Case normalized)';
COMMENT ON COLUMN running_summaries.momentum IS '75-125 words about current state: active tensions, character positions, thematic direction';
COMMENT ON COLUMN running_summaries.last_updated_page IS 'Page number when this was last updated (5, 10, 15...)';


-- ==================== CHUNK SUMMARIES ====================
-- Factual summaries of 5-page segments
-- Provides complete coverage of story history

CREATE TABLE chunk_summaries (
    id SERIAL PRIMARY KEY,
    seed TEXT NOT NULL,
    chunk_start INTEGER NOT NULL,                    -- First page of chunk (1, 6, 11, 16...)
    chunk_end INTEGER NOT NULL,                      -- Last page of chunk (5, 10, 15, 20...)
    summary TEXT NOT NULL,                           -- 75-125 words: key events, character developments, plot progressions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_chunk UNIQUE (seed, chunk_start)
);

CREATE INDEX idx_chunk_summaries_seed ON chunk_summaries(seed);
CREATE INDEX idx_chunk_summaries_seed_end ON chunk_summaries(seed, chunk_end);

COMMENT ON TABLE chunk_summaries IS 'Factual summaries of 5-page story segments for complete coverage';
COMMENT ON COLUMN chunk_summaries.seed IS 'Book title/identifier (Title Case normalized)';
COMMENT ON COLUMN chunk_summaries.chunk_start IS 'First page number of this chunk (1, 6, 11, 16...)';
COMMENT ON COLUMN chunk_summaries.chunk_end IS 'Last page number of this chunk (5, 10, 15, 20...)';
COMMENT ON COLUMN chunk_summaries.summary IS '75-125 words: key events, character developments, plot progressions in this chunk';


-- ==================== HELPER FUNCTION: SEED NORMALIZATION ====================
-- Normalizes seeds to Title Case for consistent handling
-- Used by migration 008_normalize_seeds.sql

CREATE OR REPLACE FUNCTION normalize_seed(seed TEXT) RETURNS TEXT AS $$
DECLARE
    words TEXT[];
    word TEXT;
    result TEXT := '';
    upper_count INTEGER;
    -- Small words that stay lowercase (unless first word)
    small_words TEXT[] := ARRAY['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet'];
BEGIN
    IF seed IS NULL OR seed = '' THEN
        RETURN seed;
    END IF;
    
    words := string_to_array(seed, ' ');
    
    FOR i IN 1..array_length(words, 1) LOOP
        word := words[i];
        
        -- Count uppercase letters in the word
        SELECT COUNT(*) INTO upper_count 
        FROM regexp_matches(word, '[A-Z]', 'g');
        
        -- If word has 2+ uppercase letters (like PRMTTs, NASA), preserve it as-is
        IF upper_count >= 2 THEN
            result := result || word;
        -- First word is always capitalized
        ELSIF i = 1 THEN
            result := result || upper(substring(word from 1 for 1)) || lower(substring(word from 2));
        -- Small words stay lowercase (unless first word)
        ELSIF lower(word) = ANY(small_words) THEN
            result := result || lower(word);
        ELSE
            -- Title case: uppercase first letter, lowercase rest
            result := result || upper(substring(word from 1 for 1)) || lower(substring(word from 2));
        END IF;
        
        -- Add space between words (except after last word)
        IF i < array_length(words, 1) THEN
            result := result || ' ';
        END IF;
    END LOOP;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION normalize_seed(TEXT) IS 'Normalizes a seed to Title Case for consistent book naming';
