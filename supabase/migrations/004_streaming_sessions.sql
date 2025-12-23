-- Migration: 004_streaming_sessions.sql
-- Description: Add streaming session tracking table
-- 
-- This table tracks AssemblyAI streaming sessions for meetings.
-- Per AssemblyAI Streaming API v3:
-- - SessionBegins returns session_id and expires_at
-- - Sessions process audio chunks in real-time
-- - SessionTerminated marks end of session

-- Create streaming_sessions table
CREATE TABLE IF NOT EXISTS streaming_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  
  -- AssemblyAI session info (from SessionBegins message)
  assemblyai_session_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  
  -- Session lifecycle timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Processing statistics
  chunks_processed INTEGER DEFAULT 0,
  
  -- Status tracking
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'expired')),
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast session lookups by meeting
CREATE INDEX IF NOT EXISTS idx_streaming_sessions_meeting 
  ON streaming_sessions(meeting_id);

-- Index for finding active sessions
CREATE INDEX IF NOT EXISTS idx_streaming_sessions_active 
  ON streaming_sessions(status) 
  WHERE status = 'active';

-- Index for cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_streaming_sessions_expires 
  ON streaming_sessions(expires_at) 
  WHERE status = 'active' AND expires_at IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE streaming_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own streaming sessions
CREATE POLICY "Users can view own streaming sessions" 
  ON streaming_sessions
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM meetings 
      WHERE meetings.id = streaming_sessions.meeting_id 
      AND meetings.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert streaming sessions for their meetings
CREATE POLICY "Users can create streaming sessions for own meetings" 
  ON streaming_sessions
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meetings 
      WHERE meetings.id = meeting_id 
      AND meetings.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can update their own streaming sessions
CREATE POLICY "Users can update own streaming sessions" 
  ON streaming_sessions
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM meetings 
      WHERE meetings.id = streaming_sessions.meeting_id 
      AND meetings.user_id = auth.uid()
    )
  );

-- Add columns to transcript_segments if not exists
-- These track which segments came from streaming vs batch processing
DO $$
BEGIN
  -- Add is_streaming_result column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transcript_segments' 
    AND column_name = 'is_streaming_result'
  ) THEN
    ALTER TABLE transcript_segments 
    ADD COLUMN is_streaming_result BOOLEAN DEFAULT false;
  END IF;

  -- Add streaming_session_id column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transcript_segments' 
    AND column_name = 'streaming_session_id'
  ) THEN
    ALTER TABLE transcript_segments 
    ADD COLUMN streaming_session_id UUID REFERENCES streaming_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add streaming-related columns to meetings if not exists
DO $$
BEGIN
  -- Add used_streaming_transcription column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'meetings' 
    AND column_name = 'used_streaming_transcription'
  ) THEN
    ALTER TABLE meetings 
    ADD COLUMN used_streaming_transcription BOOLEAN DEFAULT false;
  END IF;

  -- Add live_transcript_data column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'meetings' 
    AND column_name = 'live_transcript_data'
  ) THEN
    ALTER TABLE meetings 
    ADD COLUMN live_transcript_data JSONB;
  END IF;
END $$;

-- Index for transcript segments from streaming
CREATE INDEX IF NOT EXISTS idx_transcript_segments_streaming 
  ON transcript_segments(streaming_session_id) 
  WHERE is_streaming_result = true;

-- Function to automatically expire old active sessions
CREATE OR REPLACE FUNCTION expire_streaming_sessions()
RETURNS void AS $$
BEGIN
  UPDATE streaming_sessions
  SET 
    status = 'expired',
    ended_at = NOW()
  WHERE 
    status = 'active' 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment on table for documentation
COMMENT ON TABLE streaming_sessions IS 
  'Tracks AssemblyAI real-time streaming transcription sessions for meetings';

COMMENT ON COLUMN streaming_sessions.assemblyai_session_id IS 
  'session_id from AssemblyAI SessionBegins message';

COMMENT ON COLUMN streaming_sessions.expires_at IS 
  'expires_at from AssemblyAI SessionBegins message';

COMMENT ON COLUMN streaming_sessions.chunks_processed IS 
  'Number of audio chunks successfully processed through AssemblyAI';

