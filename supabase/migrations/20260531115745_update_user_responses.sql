TRUNCATE TABLE user_responses CASCADE;

ALTER TABLE user_responses
ALTER COLUMN participant_email DROP NOT NULL;

ALTER TABLE user_responses
ADD COLUMN participant_guest_id UUID NOT NULL;

CREATE POLICY "Allow public delete access to quizzes" ON quizzes FOR DELETE TO public USING (true);
CREATE POLICY "Allow public delete access to questions" ON questions FOR DELETE TO public USING (true);
CREATE POLICY "Allow public delete access to quiz_sessions" ON quiz_sessions FOR DELETE TO public USING (true);
