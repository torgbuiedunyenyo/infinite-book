-- Migration: Add generation_prompt column to store the complete prompt used for each page
-- This enables debugging, reproducibility, and analysis of generated content

-- Add column to store the complete user prompt sent to Claude when generating each page
ALTER TABLE pages ADD COLUMN IF NOT EXISTS generation_prompt TEXT;

-- Add comment for documentation
COMMENT ON COLUMN pages.generation_prompt IS 'The complete user prompt sent to Claude when generating this page. NULL for pages generated before this migration.';

