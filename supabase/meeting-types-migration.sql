-- ============================================
-- MEETING TYPES MIGRATION
-- ============================================
-- This migration transforms hardcoded meeting types into user-customizable entities
-- Run this migration after the initial schema.sql has been executed

-- ============================================
-- STEP 1: CREATE MEETING_TYPES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS meeting_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT meeting_types_name_unique_per_user UNIQUE (user_id, LOWER(name))
);

-- ============================================
-- STEP 2: CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_meeting_types_user_id ON meeting_types(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_types_user_active ON meeting_types(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_meeting_types_display_order ON meeting_types(user_id, display_order);

-- ============================================
-- STEP 3: ENABLE RLS AND CREATE POLICIES
-- ============================================

ALTER TABLE meeting_types ENABLE ROW LEVEL SECURITY;

-- Users can view their own meeting types
CREATE POLICY "Users can view own meeting types" ON meeting_types
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own meeting types
CREATE POLICY "Users can insert own meeting types" ON meeting_types
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own meeting types
CREATE POLICY "Users can update own meeting types" ON meeting_types
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own meeting types (soft delete recommended)
CREATE POLICY "Users can delete own meeting types" ON meeting_types
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- STEP 4: CREATE HELPER FUNCTIONS
-- ============================================

-- Function to create default meeting types for a user
CREATE OR REPLACE FUNCTION create_default_meeting_types(target_user_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO meeting_types (user_id, name, color, is_default, display_order)
  VALUES
    (target_user_id, 'General Legal Meeting', '#3B82F6', true, 1),
    (target_user_id, 'Client Consultation', '#10B981', true, 2),
    (target_user_id, 'Case Review', '#8B5CF6', true, 3),
    (target_user_id, 'Settlement Discussion', '#F59E0B', true, 4),
    (target_user_id, 'Contract Negotiation', '#06B6D4', true, 5),
    (target_user_id, 'Witness Interview', '#EC4899', true, 6),
    (target_user_id, 'Internal Meeting', '#6B7280', true, 7)
  ON CONFLICT (user_id, LOWER(name)) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the handle_new_user function to create default meeting types
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email);
  
  -- Create default meeting types for the new user
  PERFORM create_default_meeting_types(NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger (drop and create to ensure it uses the updated function)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- STEP 5: CREATE DEFAULT TYPES FOR EXISTING USERS
-- ============================================

-- Populate default meeting types for all existing users
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN SELECT id FROM auth.users
  LOOP
    PERFORM create_default_meeting_types(user_record.id);
  END LOOP;
END $$;

-- ============================================
-- STEP 6: ADD MEETING_TYPE_ID TO MEETINGS TABLE
-- ============================================

-- Add new column for foreign key relationship
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_type_id UUID REFERENCES meeting_types(id) ON DELETE SET NULL;

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_meetings_meeting_type_id ON meetings(meeting_type_id);

-- ============================================
-- STEP 7: MIGRATE EXISTING MEETING DATA
-- ============================================

-- Migrate existing meetings to use meeting_type_id based on their enum value
DO $$
DECLARE
  meeting_record RECORD;
  type_id UUID;
BEGIN
  FOR meeting_record IN 
    SELECT id, user_id, meeting_type FROM meetings WHERE meeting_type_id IS NULL
  LOOP
    -- Find the matching meeting type for this user
    SELECT mt.id INTO type_id
    FROM meeting_types mt
    WHERE mt.user_id = meeting_record.user_id
      AND mt.name = meeting_record.meeting_type::text
    LIMIT 1;
    
    -- Update the meeting with the type_id
    IF type_id IS NOT NULL THEN
      UPDATE meetings 
      SET meeting_type_id = type_id 
      WHERE id = meeting_record.id;
    END IF;
  END LOOP;
END $$;

-- ============================================
-- STEP 8: ADD UPDATED_AT TRIGGER
-- ============================================

CREATE TRIGGER meeting_types_updated_at
  BEFORE UPDATE ON meeting_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- STEP 9: DROP OLD ENUM COLUMN (OPTIONAL - RUN AFTER VERIFICATION)
-- ============================================

-- IMPORTANT: Only run this after verifying that all meetings have been migrated
-- and the application is updated to use meeting_type_id
-- 
-- ALTER TABLE meetings DROP COLUMN IF EXISTS meeting_type;
-- DROP TYPE IF EXISTS meeting_type;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify meeting types were created
-- SELECT user_id, COUNT(*) as type_count FROM meeting_types GROUP BY user_id;

-- Verify meetings were migrated
-- SELECT 
--   COUNT(*) as total_meetings,
--   COUNT(meeting_type_id) as migrated_meetings,
--   COUNT(*) - COUNT(meeting_type_id) as unmigrated_meetings
-- FROM meetings;

-- Check for any meetings without a type_id
-- SELECT id, user_id, meeting_type, meeting_type_id 
-- FROM meetings 
-- WHERE meeting_type_id IS NULL;

