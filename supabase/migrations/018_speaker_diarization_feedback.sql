-- Migration: 018_speaker_diarization_feedback.sql
-- Description: Add speaker diarization tracking columns and feedback table
-- Purpose: Track detected vs expected speakers, enable user feedback for transcription issues

-- =============================================================================
-- Part 1: Add new columns to meetings table for speaker tracking
-- =============================================================================

-- Number of speakers actually detected by AssemblyAI
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS detected_speakers INTEGER;

COMMENT ON COLUMN meetings.detected_speakers IS 
  'Actual number of speakers detected by AssemblyAI during transcription';

-- Boolean flag indicating if detected speakers differs from expected
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS speaker_mismatch BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN meetings.speaker_mismatch IS 
  'True if detected_speakers differs from expected_speakers';

-- Language code used for transcription (for future multi-language support)
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS transcription_language TEXT DEFAULT 'en';

COMMENT ON COLUMN meetings.transcription_language IS 
  'Language code used for transcription (default: en). Used to determine speech model.';

-- Speech model used for transcription
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS speech_model_used TEXT;

COMMENT ON COLUMN meetings.speech_model_used IS 
  'AssemblyAI speech model used: slam-1 (English), best (Universal/multi-language)';

-- =============================================================================
-- Part 2: Create speaker_feedback table for user feedback collection
-- =============================================================================

CREATE TABLE IF NOT EXISTS speaker_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Feedback details
  feedback_type TEXT NOT NULL CHECK (
    feedback_type IN (
      'wrong_speaker_count',
      'speakers_merged', 
      'speakers_split',
      'wrong_attribution',
      'other'
    )
  ),
  expected_speakers INTEGER NOT NULL,
  detected_speakers INTEGER NOT NULL,
  notes TEXT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'reviewed', 'resolved')
  ),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment to table
COMMENT ON TABLE speaker_feedback IS 
  'User feedback on speaker diarization accuracy for continuous improvement';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_speaker_feedback_meeting_id 
  ON speaker_feedback(meeting_id);
CREATE INDEX IF NOT EXISTS idx_speaker_feedback_user_id 
  ON speaker_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_speaker_feedback_status 
  ON speaker_feedback(status);
CREATE INDEX IF NOT EXISTS idx_speaker_feedback_created_at 
  ON speaker_feedback(created_at DESC);

-- =============================================================================
-- Part 3: Enable Row Level Security
-- =============================================================================

ALTER TABLE speaker_feedback ENABLE ROW LEVEL SECURITY;

-- Users can view their own feedback
CREATE POLICY "Users can view their own speaker feedback"
  ON speaker_feedback FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert feedback for their own meetings
CREATE POLICY "Users can insert speaker feedback for their meetings"
  ON speaker_feedback FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM meetings 
      WHERE meetings.id = meeting_id 
      AND meetings.user_id = auth.uid()
    )
  );

-- Users can update their own feedback (e.g., add notes)
CREATE POLICY "Users can update their own speaker feedback"
  ON speaker_feedback FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own feedback
CREATE POLICY "Users can delete their own speaker feedback"
  ON speaker_feedback FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- Part 4: Create trigger for updated_at
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_speaker_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_speaker_feedback_updated_at ON speaker_feedback;
CREATE TRIGGER trigger_speaker_feedback_updated_at
  BEFORE UPDATE ON speaker_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_speaker_feedback_updated_at();

-- =============================================================================
-- Part 5: Create admin view for feedback analysis
-- =============================================================================

CREATE OR REPLACE VIEW admin_speaker_feedback_summary AS
SELECT 
  sf.id,
  sf.meeting_id,
  sf.user_id,
  p.email as user_email,
  sf.feedback_type,
  sf.expected_speakers,
  sf.detected_speakers,
  sf.notes,
  sf.status,
  sf.created_at,
  m.title as meeting_title,
  m.speech_model_used,
  m.transcription_language
FROM speaker_feedback sf
JOIN meetings m ON sf.meeting_id = m.id
LEFT JOIN profiles p ON sf.user_id = p.id
ORDER BY sf.created_at DESC;

COMMENT ON VIEW admin_speaker_feedback_summary IS 
  'Admin view for analyzing speaker feedback with meeting and user details';

