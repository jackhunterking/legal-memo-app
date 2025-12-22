-- Add meeting_tasks table for AI-generated tasks with reminders
-- Run this in Supabase SQL Editor

-- Create task priority enum
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');

-- Create meeting_tasks table
CREATE TABLE meeting_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority task_priority DEFAULT 'medium',
  completed BOOLEAN DEFAULT false,
  reminder_time TIMESTAMPTZ,
  notification_id TEXT,
  owner TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index
CREATE INDEX idx_meeting_tasks_meeting_id ON meeting_tasks(meeting_id);
CREATE INDEX idx_meeting_tasks_user_id ON meeting_tasks(user_id);
CREATE INDEX idx_meeting_tasks_reminder_time ON meeting_tasks(reminder_time);
CREATE INDEX idx_meeting_tasks_completed ON meeting_tasks(completed);

-- Enable RLS
ALTER TABLE meeting_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own tasks" ON meeting_tasks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tasks" ON meeting_tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks" ON meeting_tasks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tasks" ON meeting_tasks
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER meeting_tasks_updated_at
  BEFORE UPDATE ON meeting_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
