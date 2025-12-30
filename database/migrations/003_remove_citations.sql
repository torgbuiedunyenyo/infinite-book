-- Migration: Remove citations column
-- The citations feature (Exa.ai web search) has been removed from the application.
-- This column was always populated with empty arrays and is no longer used.

ALTER TABLE pages DROP COLUMN IF EXISTS citations;

