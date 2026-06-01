-- Migration: Add image_url and correct_index to the questions table
-- This allows for media-rich questions and index-based grading (0, 1, 2, 3) 
-- instead of relying on exact text matching for correct_option.

ALTER TABLE public.questions
ADD COLUMN image_url TEXT,
ADD COLUMN correct_index INTEGER;

-- Migration: Add sort_order to preserve CSV import order
-- Run this in your Supabase SQL editor to add the column:
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Back-fill existing rows so they keep their current created_at order:
UPDATE public.questions q
SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY quiz_id ORDER BY created_at ASC) AS rn
  FROM public.questions
) sub
WHERE q.id = sub.id AND q.sort_order IS NULL;
