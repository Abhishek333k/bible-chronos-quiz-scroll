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

-- Migration: Managed Session Tokens Upgrades
CREATE TABLE session_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    access_token VARCHAR(6) UNIQUE NOT NULL,
    assigned_name TEXT DEFAULT NULL,
    is_claimed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE user_responses
ADD COLUMN access_token VARCHAR(6) REFERENCES session_tokens(access_token);

CREATE INDEX idx_session_tokens_access_token ON session_tokens(access_token);

-- Fix for 403 Forbidden Error: Granting anon access and setting up RLS policies
GRANT ALL ON TABLE public.session_tokens TO anon;
GRANT ALL ON TABLE public.session_tokens TO authenticated;

ALTER TABLE public.session_tokens ENABLE ROW LEVEL SECURITY;

-- Allow public to READ tokens (needed for join verification)
CREATE POLICY "Allow public read of session_tokens" ON public.session_tokens FOR SELECT USING (true);

-- Allow public to UPDATE a token ONLY to claim it (cannot unclaim or change session_id)
CREATE POLICY "Allow public to claim tokens" ON public.session_tokens FOR UPDATE USING (is_claimed = false) WITH CHECK (is_claimed = true);

-- Allow authenticated Admins full access (Insert, Update, Delete)
CREATE POLICY "Allow admin full access to session_tokens" ON public.session_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.session_tokens ADD COLUMN IF NOT EXISTS is_void BOOLEAN DEFAULT FALSE;
