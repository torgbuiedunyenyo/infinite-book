-- Migration 008: Normalize all seeds to Title Case
-- This ensures consistent seed handling across the library
-- 
-- Title Case rules:
-- - First word is always capitalized
-- - Small words (a, an, the, of, etc.) stay lowercase unless first
-- - Words with 2+ uppercase letters are preserved (acronyms like PRMTTs, NASA)
--
-- Examples:
--   "clef" → "Clef"
--   "the shop" → "The Shop"
--   "PRMTTs" → "PRMTTs" (preserved - has multiple uppercase)
--   "The Shape of Time" → "The Shape of Time" (of stays lowercase)

-- Create the normalization function
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

-- Show what will be changed (for verification)
DO $$
DECLARE
    changes_count INTEGER;
BEGIN
    SELECT COUNT(DISTINCT seed) INTO changes_count
    FROM pages
    WHERE seed != normalize_seed(seed);
    
    RAISE NOTICE 'Seeds that will be normalized: %', changes_count;
END $$;

-- First, identify and merge duplicate books that differ only by case
-- We need to handle this carefully to avoid constraint violations

-- Step 1: Create a temp table with the mapping from old seed to normalized seed
CREATE TEMP TABLE seed_mapping AS
SELECT DISTINCT 
    seed as old_seed,
    normalize_seed(seed) as new_seed
FROM pages
WHERE seed != normalize_seed(seed);

-- Step 2: Update pages table
-- For seeds that need normalization but don't conflict with existing normalized seeds
UPDATE pages p
SET seed = normalize_seed(p.seed)
WHERE p.seed != normalize_seed(p.seed)
  AND NOT EXISTS (
    SELECT 1 FROM pages p2 
    WHERE p2.seed = normalize_seed(p.seed) 
      AND p2.page_number = p.page_number
  );

-- Step 3: For conflicting pages (same normalized seed + page number), 
-- keep the one with the "correct" case already and delete duplicates.
-- This handles cases like "clef" p1 and "Clef" p1 existing simultaneously.
-- We keep the one that's already properly cased (or the first one if both need change)
DELETE FROM pages p
WHERE p.seed != normalize_seed(p.seed)
  AND EXISTS (
    SELECT 1 FROM pages p2 
    WHERE p2.seed = normalize_seed(p.seed) 
      AND p2.page_number = p.page_number
      AND p2.id != p.id
  );

-- Step 4: Now update any remaining non-normalized seeds
UPDATE pages
SET seed = normalize_seed(seed)
WHERE seed != normalize_seed(seed);

-- Step 5: Normalize book_narrative_arcs
UPDATE book_narrative_arcs
SET seed = normalize_seed(seed)
WHERE seed != normalize_seed(seed);

-- Handle duplicates in book_narrative_arcs (keep one, delete others)
DELETE FROM book_narrative_arcs b
WHERE EXISTS (
    SELECT 1 FROM book_narrative_arcs b2
    WHERE normalize_seed(b2.seed) = normalize_seed(b.seed)
      AND b2.id < b.id
);

-- Step 6: Normalize chunk_summaries
UPDATE chunk_summaries
SET seed = normalize_seed(seed)
WHERE seed != normalize_seed(seed);

-- Handle duplicates in chunk_summaries
DELETE FROM chunk_summaries c
WHERE EXISTS (
    SELECT 1 FROM chunk_summaries c2
    WHERE normalize_seed(c2.seed) = normalize_seed(c.seed)
      AND c2.chunk_start = c.chunk_start
      AND c2.id < c.id
);

-- Step 7: Normalize running_summaries
UPDATE running_summaries
SET seed = normalize_seed(seed)
WHERE seed != normalize_seed(seed);

-- Handle duplicates in running_summaries
DELETE FROM running_summaries r
WHERE EXISTS (
    SELECT 1 FROM running_summaries r2
    WHERE normalize_seed(r2.seed) = normalize_seed(r.seed)
      AND r2.id < r.id
);

-- Step 8: Normalize canonical_facts source_seeds array
UPDATE canonical_facts
SET source_seeds = (
    SELECT jsonb_agg(normalize_seed(elem::text))
    FROM jsonb_array_elements_text(source_seeds) elem
)
WHERE source_seeds != '[]'::jsonb;

-- Clean up
DROP TABLE IF EXISTS seed_mapping;

-- Drop the function (optional - keep if useful for future use)
-- DROP FUNCTION IF EXISTS normalize_seed(TEXT);

-- Verify results
DO $$
DECLARE
    remaining_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_count
    FROM pages
    WHERE seed != normalize_seed(seed);
    
    IF remaining_count > 0 THEN
        RAISE WARNING 'Warning: % pages still have non-normalized seeds', remaining_count;
    ELSE
        RAISE NOTICE 'Success: All seeds have been normalized to Title Case';
    END IF;
END $$;

