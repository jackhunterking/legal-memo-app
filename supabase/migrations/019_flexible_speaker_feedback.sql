-- Migration: 019_flexible_speaker_feedback.sql
-- Description: Make speaker feedback fields optional to only store what users provide
-- Purpose: Allow users to submit feedback with only the fields they want to provide

-- =============================================================================
-- Make speaker feedback fields nullable/optional
-- =============================================================================

-- Make feedback_type nullable (was NOT NULL before)
ALTER TABLE speaker_feedback 
ALTER COLUMN feedback_type DROP NOT NULL;

-- Make expected_speakers nullable (was NOT NULL before)
ALTER TABLE speaker_feedback 
ALTER COLUMN expected_speakers DROP NOT NULL;

-- Make detected_speakers nullable (was NOT NULL before)
ALTER TABLE speaker_feedback 
ALTER COLUMN detected_speakers DROP NOT NULL;

-- Update the constraint to allow NULL values
ALTER TABLE speaker_feedback 
DROP CONSTRAINT IF EXISTS speaker_feedback_feedback_type_check;

ALTER TABLE speaker_feedback 
ADD CONSTRAINT speaker_feedback_feedback_type_check 
CHECK (
  feedback_type IS NULL OR 
  feedback_type IN (
    'wrong_speaker_count',
    'speakers_merged', 
    'speakers_split',
    'wrong_attribution',
    'other'
  )
);

-- Add a check to ensure at least one meaningful field is provided
ALTER TABLE speaker_feedback 
ADD CONSTRAINT speaker_feedback_has_content_check 
CHECK (
  feedback_type IS NOT NULL OR 
  (notes IS NOT NULL AND length(trim(notes)) > 0)
);

-- Update table comment
COMMENT ON TABLE speaker_feedback IS 
  'User feedback on speaker diarization accuracy. Only stores fields that users actually provide (feedback_type and/or notes).';

-- Update column comments
COMMENT ON COLUMN speaker_feedback.feedback_type IS 
  'Type of feedback (optional). NULL if user only provided notes.';
  
COMMENT ON COLUMN speaker_feedback.expected_speakers IS 
  'Expected speaker count (optional). NULL if not relevant to feedback.';
  
COMMENT ON COLUMN speaker_feedback.detected_speakers IS 
  'Detected speaker count (optional). NULL if not relevant to feedback.';
  
COMMENT ON COLUMN speaker_feedback.notes IS 
  'User notes describing the issue (optional). NULL if user only selected a feedback type.';

