-- Migration: Add streaming transcription support
-- This migration adds columns to support real-time streaming transcription

-- ============================================
-- ADD STREAMING COLUMNS TO MEETINGS
-- ============================================

-- Add column for storing raw streaming transcript data (for debugging/backup)
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS live_transcript_data JSONB;

-- Add column to track if streaming was used for this meeting
ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS used_streaming_transcription BOOLEAN DEFAULT false;

-- ============================================
-- ADD STREAMING METADATA TO TRANSCRIPT_SEGMENTS
-- ============================================

-- Add column to indicate if segment came from streaming (vs batch processing)
ALTER TABLE transcript_segments
ADD COLUMN IF NOT EXISTS is_streaming_result BOOLEAN DEFAULT false;

-- Add session ID for grouping streaming segments
ALTER TABLE transcript_segments
ADD COLUMN IF NOT EXISTS streaming_session_id TEXT;

-- ============================================
-- INDEXES FOR STREAMING DATA
-- ============================================

-- Index for streaming session lookups
CREATE INDEX IF NOT EXISTS idx_transcript_segments_streaming_session 
ON transcript_segments(streaming_session_id) 
WHERE streaming_session_id IS NOT NULL;

-- Index for filtering streaming vs batch results
CREATE INDEX IF NOT EXISTS idx_transcript_segments_is_streaming 
ON transcript_segments(is_streaming_result);

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN meetings.live_transcript_data IS 
'Raw streaming transcription data from AssemblyAI for debugging/backup';

COMMENT ON COLUMN meetings.used_streaming_transcription IS 
'Whether real-time streaming transcription was used during recording';

COMMENT ON COLUMN transcript_segments.is_streaming_result IS 
'Whether this segment was created from real-time streaming (true) or batch processing (false)';

COMMENT ON COLUMN transcript_segments.streaming_session_id IS 
'AssemblyAI streaming session ID for grouping related segments';

