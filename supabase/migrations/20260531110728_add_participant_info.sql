-- Add participant identification and speedrun timing to user_responses
ALTER TABLE user_responses
ADD COLUMN participant_name TEXT NOT NULL,
ADD COLUMN participant_email TEXT NOT NULL,
ADD COLUMN time_taken_ms INTEGER NOT NULL;
