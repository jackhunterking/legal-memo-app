-- ============================================
-- MEETING TYPES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS meeting_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  is_default BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add meeting_type_id column to meetings table
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_type_id UUID REFERENCES meeting_types(id) ON DELETE SET NULL;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_meeting_types_user_id ON meeting_types(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_types_display_order ON meeting_types(display_order);
CREATE INDEX IF NOT EXISTS idx_meetings_meeting_type_id ON meetings(meeting_type_id);

-- ============================================
-- ROW LEVEL SECURITY
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

-- Users can delete their own meeting types (non-default only)
CREATE POLICY "Users can delete own meeting types" ON meeting_types
  FOR DELETE USING (auth.uid() = user_id AND is_default = false);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE TRIGGER meeting_types_updated_at
  BEFORE UPDATE ON meeting_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- FUNCTION: Create default meeting types for new users
-- ============================================

CREATE OR REPLACE FUNCTION create_default_meeting_types()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO meeting_types (user_id, name, color, is_default, display_order)
  VALUES 
    (NEW.id, 'Consultation', '#3B82F6', true, 1),
    (NEW.id, 'Review', '#8B5CF6', true, 2),
    (NEW.id, 'Negotiation', '#F59E0B', true, 3)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create default types when a new user signs up
DROP TRIGGER IF EXISTS on_profile_created_meeting_types ON profiles;
CREATE TRIGGER on_profile_created_meeting_types
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION create_default_meeting_types();

-- ============================================
-- SEED DEFAULT TYPES FOR EXISTING USERS
-- ============================================

INSERT INTO meeting_types (user_id, name, color, is_default, display_order)
SELECT 
  p.id as user_id,
  t.name,
  t.color,
  true as is_default,
  t.display_order
FROM profiles p
CROSS JOIN (
  VALUES 
    ('Consultation', '#3B82F6', 1),
    ('Review', '#8B5CF6', 2),
    ('Negotiation', '#F59E0B', 3)
) AS t(name, color, display_order)
ON CONFLICT DO NOTHING;

