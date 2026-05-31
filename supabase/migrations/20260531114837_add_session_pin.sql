-- Truncate existing sessions to allow adding a NOT NULL UNIQUE column without errors
TRUNCATE TABLE quiz_sessions CASCADE;

-- Add access_pin column
ALTER TABLE quiz_sessions
ADD COLUMN access_pin VARCHAR(6) NOT NULL UNIQUE;

-- Update the foreign key constraint on the questions table to cascade on delete
ALTER TABLE questions
DROP CONSTRAINT IF EXISTS questions_quiz_id_fkey,
ADD CONSTRAINT questions_quiz_id_fkey
  FOREIGN KEY (quiz_id)
  REFERENCES quizzes(id)
  ON DELETE CASCADE;
