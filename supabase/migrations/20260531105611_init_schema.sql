-- 1. Create quizzes table
CREATE TABLE quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create questions table
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    correct_option TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create quiz_sessions table
CREATE TABLE quiz_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed')),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create user_responses table
CREATE TABLE user_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected_option TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_responses ENABLE ROW LEVEL SECURITY;

-- Create Policies

-- Allow public read for quizzes
CREATE POLICY "Allow public read access to quizzes"
ON quizzes FOR SELECT
TO public
USING (true);

-- Allow public read for questions
CREATE POLICY "Allow public read access to questions"
ON questions FOR SELECT
TO public
USING (true);

-- Allow public insert for user_responses
CREATE POLICY "Allow public insert access to user_responses"
ON user_responses FOR INSERT
TO public
WITH CHECK (true);

-- Allow public read/insert/update for quiz_sessions (needed for client-side speedrun/session tracking)
CREATE POLICY "Allow public read access to quiz_sessions"
ON quiz_sessions FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public insert access to quiz_sessions"
ON quiz_sessions FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public update access to quiz_sessions"
ON quiz_sessions FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Allow public read for user_responses (useful for score calculation & feedback check)
CREATE POLICY "Allow public read access to user_responses"
ON user_responses FOR SELECT
TO public
USING (true);
