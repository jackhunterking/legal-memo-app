-- Add expected_speakers column for diarization configuration
ALTER TABLE meetings 
ADD COLUMN expected_speakers INTEGER DEFAULT 2;

COMMENT ON COLUMN meetings.expected_speakers IS 
  'Number of expected speakers: 1 = solo, 2 = two people (default), 3 = three or more';

