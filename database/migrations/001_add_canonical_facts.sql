-- Migration: Add canonical_facts table for cross-book consistency
-- Run this if you have an existing database with just the pages table

-- Create the canonical_facts table
CREATE TABLE IF NOT EXISTS canonical_facts (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('character', 'place', 'event', 'object', 'relationship')),
    name TEXT NOT NULL,
    fact TEXT NOT NULL,
    source_seeds JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_category_name UNIQUE (category, name)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_canonical_facts_category ON canonical_facts(category);
CREATE INDEX IF NOT EXISTS idx_canonical_facts_name ON canonical_facts(name);

-- Full-text search index for finding relevant facts
CREATE INDEX IF NOT EXISTS idx_canonical_facts_search ON canonical_facts USING gin(to_tsvector('english', name || ' ' || fact));

-- Verify the migration
DO $$
BEGIN
    RAISE NOTICE 'Migration complete: canonical_facts table created with % rows', (SELECT COUNT(*) FROM canonical_facts);
END $$;

