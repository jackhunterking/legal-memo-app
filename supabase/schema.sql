-- Legal Meeting Intelligence MVP - Supabase Database Schema
-- Run this in Supabase SQL Editor to set up your database

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE meeting_status AS ENUM ('recording', 'uploading', 'processing', 'ready', 'failed');
CREATE TYPE meeting_type AS ENUM (
  'General Legal Meeting',
  'Client Consultation', 
  'Case Review',
  'Settlement Discussion',
  'Contract Negotiation',
  'Witness Interview',
  'Internal Meeting'
);
CREATE TYPE speaker_label AS ENUM ('LAWYER', 'CLIENT', 'OTHER', 'UNKNOWN');
CREATE TYPE certainty_level AS ENUM ('explicit', 'unclear');
CREATE TYPE job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
CREATE TYPE job_step AS ENUM ('transcribe', 'summarize', 'index');

-- ============================================
-- TABLES
-- ============================================

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  default_hourly_rate DECIMAL(10,2) DEFAULT 250.00,
  last_billable_setting BOOLEAN DEFAULT false,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts table
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT CHECK (role IN ('CLIENT', 'LAWYER', 'OTHER')) DEFAULT 'CLIENT',
  company TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meetings table
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auto_title TEXT NOT NULL,
  title_override TEXT,
  meeting_type meeting_type DEFAULT 'General Legal Meeting',
  client_name TEXT,
  primary_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  status meeting_status DEFAULT 'recording',
  audio_path TEXT,
  duration_seconds INTEGER DEFAULT 0,
  billable BOOLEAN DEFAULT false,
  billable_seconds INTEGER DEFAULT 0,
  hourly_rate_snapshot DECIMAL(10,2) DEFAULT 250.00,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meeting consent logs (required before recording)
CREATE TABLE meeting_consent_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  informed_participants BOOLEAN NOT NULL,
  recording_lawful BOOLEAN NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL,
  device_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transcript segments
CREATE TABLE transcript_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  speaker_label speaker_label DEFAULT 'UNKNOWN',
  speaker_name TEXT,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  text TEXT NOT NULL,
  confidence DECIMAL(5,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI outputs (structured summaries)
CREATE TABLE ai_outputs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE UNIQUE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  meeting_overview JSONB NOT NULL,
  key_facts_stated JSONB DEFAULT '[]'::jsonb,
  legal_issues_discussed JSONB DEFAULT '[]'::jsonb,
  decisions_made JSONB DEFAULT '[]'::jsonb,
  risks_or_concerns_raised JSONB DEFAULT '[]'::jsonb,
  follow_up_actions JSONB DEFAULT '[]'::jsonb,
  open_questions JSONB DEFAULT '[]'::jsonb,
  disclaimer TEXT DEFAULT 'This summary is AI-generated for documentation support and may contain errors. It is not legal advice.',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meeting processing jobs queue
CREATE TABLE meeting_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  status job_status DEFAULT 'queued',
  step job_step,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search materialized view
CREATE TABLE meeting_search_index (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE UNIQUE,
  searchable_text TEXT,
  search_vector TSVECTOR,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_full_name ON contacts(full_name);
CREATE INDEX idx_meetings_user_id ON meetings(user_id);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_created_at ON meetings(created_at DESC);
CREATE INDEX idx_meetings_primary_contact_id ON meetings(primary_contact_id);
CREATE INDEX idx_transcript_segments_meeting_id ON transcript_segments(meeting_id);
CREATE INDEX idx_transcript_segments_start_ms ON transcript_segments(start_ms);
CREATE INDEX idx_ai_outputs_meeting_id ON ai_outputs(meeting_id);
CREATE INDEX idx_meeting_jobs_status ON meeting_jobs(status);
CREATE INDEX idx_meeting_jobs_meeting_id ON meeting_jobs(meeting_id);
CREATE INDEX idx_meeting_search_vector ON meeting_search_index USING GIN(search_vector);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_consent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_search_index ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Contacts policies
CREATE POLICY "Users can view own contacts" ON contacts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contacts" ON contacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contacts" ON contacts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts" ON contacts
  FOR DELETE USING (auth.uid() = user_id);

-- Meetings policies
CREATE POLICY "Users can view own meetings" ON meetings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meetings" ON meetings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meetings" ON meetings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own meetings" ON meetings
  FOR DELETE USING (auth.uid() = user_id);

-- Consent logs policies
CREATE POLICY "Users can view own consent logs" ON meeting_consent_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own consent logs" ON meeting_consent_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

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

-- AI outputs policies (via meeting ownership)
CREATE POLICY "Users can view own ai outputs" ON ai_outputs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own ai outputs" ON ai_outputs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can delete own ai outputs" ON ai_outputs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

-- Meeting jobs policies
CREATE POLICY "Users can view own meeting jobs" ON meeting_jobs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own meeting jobs" ON meeting_jobs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can update own meeting jobs" ON meeting_jobs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can delete own meeting jobs" ON meeting_jobs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

-- Search index policies
CREATE POLICY "Users can view own search index" ON meeting_search_index
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own search index" ON meeting_search_index
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can update own search index" ON meeting_search_index
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

CREATE POLICY "Users can delete own search index" ON meeting_search_index
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.user_id = auth.uid())
  );

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

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER meeting_jobs_updated_at
  BEFORE UPDATE ON meeting_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update search index function
CREATE OR REPLACE FUNCTION update_meeting_search_index()
RETURNS TRIGGER AS $$
DECLARE
  transcript_text TEXT;
  summary_text TEXT;
BEGIN
  -- Get transcript text
  SELECT string_agg(text, ' ') INTO transcript_text
  FROM transcript_segments
  WHERE meeting_id = NEW.id;
  
  -- Get summary text from AI output
  SELECT 
    COALESCE(meeting_overview->>'one_sentence_summary', '') || ' ' ||
    COALESCE(array_to_string(ARRAY(SELECT jsonb_array_elements_text(key_facts_stated)), ' '), '') || ' ' ||
    COALESCE(array_to_string(ARRAY(SELECT jsonb_array_elements_text(legal_issues_discussed)), ' '), '') || ' ' ||
    COALESCE(array_to_string(ARRAY(SELECT jsonb_array_elements_text(decisions_made)), ' '), '') || ' ' ||
    COALESCE(array_to_string(ARRAY(SELECT jsonb_array_elements_text(follow_up_actions)), ' '), '')
  INTO summary_text
  FROM ai_outputs
  WHERE meeting_id = NEW.id;
  
  -- Upsert search index
  INSERT INTO meeting_search_index (meeting_id, searchable_text, search_vector)
  VALUES (
    NEW.id,
    COALESCE(NEW.auto_title, '') || ' ' || 
    COALESCE(NEW.title_override, '') || ' ' || 
    COALESCE(NEW.client_name, '') || ' ' ||
    COALESCE(transcript_text, '') || ' ' ||
    COALESCE(summary_text, ''),
    to_tsvector('english', 
      COALESCE(NEW.auto_title, '') || ' ' || 
      COALESCE(NEW.title_override, '') || ' ' || 
      COALESCE(NEW.client_name, '') || ' ' ||
      COALESCE(transcript_text, '') || ' ' ||
      COALESCE(summary_text, '')
    )
  )
  ON CONFLICT (meeting_id) DO UPDATE SET
    searchable_text = EXCLUDED.searchable_text,
    search_vector = EXCLUDED.search_vector,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER meeting_search_index_trigger
  AFTER INSERT OR UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_meeting_search_index();

-- ============================================
-- STORAGE BUCKET
-- ============================================

-- Run this in Supabase Dashboard > Storage > Create Bucket
-- Bucket name: meeting-audio
-- Public: false
-- File size limit: 500MB
-- Allowed MIME types: audio/mp4, audio/m4a, audio/webm, audio/mpeg

-- Storage policies (run in SQL editor)
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

-- Allow users to delete their own audio
CREATE POLICY "Users can delete own audio"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'meeting-audio' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
