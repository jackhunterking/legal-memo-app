-- ============================================
-- CONTACTS FEATURE
-- Migration for contact management system
-- ============================================

-- ============================================
-- CONTACT CATEGORIES TABLE
-- Legal-specific contact types (Client, Opposing Counsel, etc.)
-- ============================================

CREATE TABLE IF NOT EXISTS contact_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  is_default BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CONTACTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES contact_categories(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  company TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  -- Future CRM integration fields (nullable for now)
  external_id TEXT,
  external_source TEXT CHECK (external_source IN ('clio', 'practicepanther', NULL)),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add contact_id column to meetings table
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_contact_categories_user_id ON contact_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_categories_display_order ON contact_categories(display_order);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_category_id ON contacts(category_id);
CREATE INDEX IF NOT EXISTS idx_contacts_first_name ON contacts(first_name);
CREATE INDEX IF NOT EXISTS idx_contacts_last_name ON contacts(last_name);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company);
CREATE INDEX IF NOT EXISTS idx_meetings_contact_id ON meetings(contact_id);

-- Full-text search index for contacts
CREATE INDEX IF NOT EXISTS idx_contacts_search ON contacts USING gin(
  to_tsvector('english', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(email, ''))
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE contact_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Contact Categories Policies
CREATE POLICY "Users can view own contact categories" ON contact_categories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contact categories" ON contact_categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contact categories" ON contact_categories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contact categories" ON contact_categories
  FOR DELETE USING (auth.uid() = user_id AND is_default = false);

-- Contacts Policies
CREATE POLICY "Users can view own contacts" ON contacts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contacts" ON contacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contacts" ON contacts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts" ON contacts
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp for contact_categories
CREATE TRIGGER contact_categories_updated_at
  BEFORE UPDATE ON contact_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-update updated_at timestamp for contacts
CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- FUNCTION: Create default contact categories for new users
-- ============================================

CREATE OR REPLACE FUNCTION create_default_contact_categories()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO contact_categories (user_id, name, color, is_default, display_order)
  VALUES 
    (NEW.id, 'Client', '#3B82F6', true, 1),
    (NEW.id, 'Opposing Counsel', '#EF4444', true, 2),
    (NEW.id, 'Witness', '#8B5CF6', true, 3),
    (NEW.id, 'Expert', '#F59E0B', true, 4),
    (NEW.id, 'Co-Counsel', '#10B981', true, 5)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create default categories when a new user signs up
DROP TRIGGER IF EXISTS on_profile_created_contact_categories ON profiles;
CREATE TRIGGER on_profile_created_contact_categories
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION create_default_contact_categories();

-- ============================================
-- SEED DEFAULT CATEGORIES FOR EXISTING USERS
-- ============================================

INSERT INTO contact_categories (user_id, name, color, is_default, display_order)
SELECT 
  p.id as user_id,
  t.name,
  t.color,
  true as is_default,
  t.display_order
FROM profiles p
CROSS JOIN (
  VALUES 
    ('Client', '#3B82F6', 1),
    ('Opposing Counsel', '#EF4444', 2),
    ('Witness', '#8B5CF6', 3),
    ('Expert', '#F59E0B', 4),
    ('Co-Counsel', '#10B981', 5)
) AS t(name, color, display_order)
ON CONFLICT DO NOTHING;

