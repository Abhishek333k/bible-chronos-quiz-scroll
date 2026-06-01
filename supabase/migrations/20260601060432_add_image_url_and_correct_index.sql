-- Migration: Add image_url and correct_index to the questions table
-- This allows for media-rich questions and index-based grading (0, 1, 2, 3) 
-- instead of relying on exact text matching for correct_option.

ALTER TABLE public.questions
ADD COLUMN image_url TEXT,
ADD COLUMN correct_index INTEGER;

-- Optional: If you want to automatically migrate existing data where 
-- correct_option matches option_a (0), option_b (1), etc., you could run:
-- 
-- UPDATE public.questions 
-- SET correct_index = 
--   CASE 
--     WHEN correct_option = option_a THEN 0
--     WHEN correct_option = option_b THEN 1
--     WHEN correct_option = option_c THEN 2
--     WHEN correct_option = option_d THEN 3
--     ELSE NULL 
--   END;
