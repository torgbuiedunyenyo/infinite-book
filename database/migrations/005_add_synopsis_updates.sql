-- Add columns for rolling synopsis updates
-- Synopsis is updated every 5 pages to keep pace with story evolution

ALTER TABLE book_synopses 
ADD COLUMN IF NOT EXISTS updated_synopsis TEXT,
ADD COLUMN IF NOT EXISTS last_updated_page INTEGER DEFAULT 1;

-- Comments for documentation
COMMENT ON COLUMN book_synopses.updated_synopsis IS 'Synopsis updated to reflect current story state (keeps pace with story evolution)';
COMMENT ON COLUMN book_synopses.last_updated_page IS 'Page number when synopsis was last updated';

