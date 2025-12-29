-- Migration: Add speaker_names JSONB column to meetings table
-- This stores custom speaker name mappings set by user or AI
-- Example value: {"Speaker A": "John Smith", "Speaker B": "Me", "Speaker C": "Jane Doe"}

ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS speaker_names JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN meetings.speaker_names IS 'Custom speaker name mappings set by user or AI. Keys are original labels (Speaker A, Speaker B), values are custom names.';

-- Create index for efficient querying of meetings with speaker names
CREATE INDEX IF NOT EXISTS idx_meetings_speaker_names ON meetings USING gin (speaker_names) WHERE speaker_names != '{}'::jsonb;

