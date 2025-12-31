-- Story events for tracking what has happened in each book
-- These events are extracted from each page and used to prevent repetition
-- and maintain narrative continuity across pages

CREATE TABLE story_events (
    id SERIAL PRIMARY KEY,
    seed TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    event TEXT NOT NULL,
    significance TEXT DEFAULT 'minor' CHECK (significance IN ('key', 'minor')),
    entities JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Each event should be unique per page (but a page can have multiple events)
    CONSTRAINT unique_seed_page_event UNIQUE (seed, page_number, event)
);

-- Index for retrieving events by book
CREATE INDEX idx_story_events_seed ON story_events(seed);

-- Index for retrieving recent events (ordered by page)
CREATE INDEX idx_story_events_seed_page ON story_events(seed, page_number DESC);

-- Index for retrieving key events specifically
CREATE INDEX idx_story_events_seed_significance ON story_events(seed, significance);

-- Comments for documentation
COMMENT ON TABLE story_events IS 'Narrative events extracted from pages for continuity tracking';
COMMENT ON COLUMN story_events.significance IS 'key = turning point/revelation, minor = ongoing action';
COMMENT ON COLUMN story_events.entities IS 'Array of character/place names involved in this event';

