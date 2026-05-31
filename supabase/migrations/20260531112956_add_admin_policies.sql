-- Allow public insert/update for quizzes
CREATE POLICY "Allow public insert access to quizzes"
ON quizzes FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public update access to quizzes"
ON quizzes FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Allow public insert/update for questions
CREATE POLICY "Allow public insert access to questions"
ON questions FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public update access to questions"
ON questions FOR UPDATE
TO public
USING (true)
WITH CHECK (true);
