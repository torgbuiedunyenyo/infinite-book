-- Migration 007: Narrative Restructure
-- Add priority to canonical_facts and lineage tracking to pages

-- Add priority to canonical_facts
ALTER TABLE canonical_facts ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1;

-- Add lineage tracking to pages (optional but recommended)
ALTER TABLE pages ADD COLUMN IF NOT EXISTS referrer_seed TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS referrer_page INTEGER;

-- Create index for priority-based retrieval
CREATE INDEX IF NOT EXISTS idx_canonical_facts_priority ON canonical_facts(priority DESC);

COMMENT ON COLUMN canonical_facts.priority IS 'Fact importance: 3=core narrative, 2=major world, 1=details';
COMMENT ON COLUMN pages.referrer_seed IS 'Seed of the page that contained the reference that led to this page';
COMMENT ON COLUMN pages.referrer_page IS 'Page number of the referrer page';

