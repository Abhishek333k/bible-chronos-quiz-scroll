ALTER TABLE quiz_sessions
ADD COLUMN is_jumbled BOOLEAN DEFAULT TRUE,
ADD COLUMN display_mode TEXT DEFAULT 'paged';
