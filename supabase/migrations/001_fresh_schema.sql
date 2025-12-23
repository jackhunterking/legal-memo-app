-- Fresh Schema for Legal Meeting Assistant
-- This is a complete rebuild with simplified tables
-- Run this on a fresh Supabase project or after dropping all existing tables

-- ============================================
-- EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_net"; -- For async HTTP calls from triggers

-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MEETINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading' 
    CHECK (status IN ('uploading', 'queued', 'converting', 'transcribing', 'ready', 'failed')),
  
  -- Audio files
  raw_audio_path TEXT,           -- Original upload (webm/m4a)
  mp3_audio_path TEXT,           -- Converted MP3 for playback
  raw_audio_format TEXT,         -- Original format: 'webm', 'm4a', etc.
  
  -- Metadata
  duration_seconds INTEGER DEFAULT 0,
  recorded_at TIMESTAMPTZ,
  
  -- Processing
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TRANSCRIPTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE UNIQUE,
  full_text TEXT,
  summary TEXT,
  assemblyai_transcript_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TRANSCRIPT SEGMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL,          -- "Speaker A", "Speaker B", etc.
  text TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  confidence DECIMAL(5,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROCESSING JOBS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  step TEXT CHECK (step IN ('converting', 'transcribing', NULL)),
  attempts INTEGER DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_meetings_user_id ON meetings(user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON meetings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_meeting_id ON transcript_segments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_start_ms ON transcript_segments(start_ms);
CREATE INDEX IF NOT EXISTS idx_transcripts_meeting_id ON transcripts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_meeting_id ON processing_jobs(meeting_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Meetings policies
CREATE POLICY "Users can view own meetings" ON meetings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meetings" ON meetings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meetings" ON meetings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own meetings" ON meetings
  FOR DELETE USING (auth.uid() = user_id);

-- Transcripts policies (via meeting ownership)
CREATE POLICY "Users can view own transcripts" ON transcripts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own transcripts" ON transcripts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can delete own transcripts" ON transcripts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

-- Transcript segments policies (via meeting ownership)
CREATE POLICY "Users can view own transcript segments" ON transcript_segments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own transcript segments" ON transcript_segments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can delete own transcript segments" ON transcript_segments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

-- Processing jobs policies (via meeting ownership)
CREATE POLICY "Users can view own processing jobs" ON processing_jobs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own processing jobs" ON processing_jobs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can update own processing jobs" ON processing_jobs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can delete own processing jobs" ON processing_jobs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

-- ============================================
-- SERVICE ROLE POLICIES (for Edge Functions)
-- ============================================

-- Allow service role to update meetings (for Edge Functions)
CREATE POLICY "Service role can update all meetings" ON meetings
  FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "Service role can insert transcripts" ON transcripts
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update transcripts" ON transcripts
  FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "Service role can insert transcript segments" ON transcript_segments
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update processing jobs" ON processing_jobs
  FOR UPDATE USING (auth.role() = 'service_role');

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER processing_jobs_updated_at
  BEFORE UPDATE ON processing_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- TRIGGER: Auto-create processing job when meeting is queued
-- ============================================

CREATE OR REPLACE FUNCTION create_processing_job()
RETURNS TRIGGER AS $$
BEGIN
  -- When a meeting status changes to 'queued', create a processing job
  IF NEW.status = 'queued' AND (OLD.status IS NULL OR OLD.status != 'queued') THEN
    INSERT INTO processing_jobs (meeting_id, status)
    VALUES (NEW.id, 'pending')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER meeting_queued_trigger
  AFTER INSERT OR UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION create_processing_job();

-- ============================================
-- STORAGE BUCKET SETUP (run manually in Supabase Dashboard)
-- ============================================

-- Bucket name: meeting-audio
-- Public: false
-- File size limit: 500MB
-- Allowed MIME types: audio/mp4, audio/m4a, audio/webm, audio/mpeg, audio/mp3

-- ============================================
-- STORAGE POLICIES
-- ============================================

-- Allow users to upload to their own folder
CREATE POLICY "Users can upload own audio"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'meeting-audio' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to read their own audio
CREATE POLICY "Users can read own audio"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'meeting-audio' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to update their own audio
CREATE POLICY "Users can update own audio"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'meeting-audio' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own audio
CREATE POLICY "Users can delete own audio"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'meeting-audio' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow service role full access to storage
CREATE POLICY "Service role full access to audio"
ON storage.objects FOR ALL
USING (auth.role() = 'service_role');

