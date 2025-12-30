-- ============================================
-- APP CONFIG & DATA INTEGRITY MIGRATION
-- Adds force update control, version tracking, and profile integrity constraints
-- ============================================

-- ============================================
-- 1. ADD VERSION TRACKING COLUMNS TO PROFILES
-- ============================================

-- Track which app version each user is running
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_app_version TEXT;

-- Track when user last opened the app
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_app_open TIMESTAMPTZ;

-- Index for efficient version queries
CREATE INDEX IF NOT EXISTS idx_profiles_current_app_version ON profiles(current_app_version);
CREATE INDEX IF NOT EXISTS idx_profiles_last_app_open ON profiles(last_app_open DESC);

-- ============================================
-- 2. CREATE APP_CONFIG TABLE
-- Centralized configuration for app-wide settings
-- ============================================

CREATE TABLE IF NOT EXISTS app_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read config (needed for force update check)
CREATE POLICY "Authenticated users can read app_config" ON app_config
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only service role can modify config
CREATE POLICY "Service role can manage app_config" ON app_config
  FOR ALL USING (auth.role() = 'service_role');

-- Insert force update config with minimum version
INSERT INTO app_config (key, value, description) VALUES
  ('force_update', '{
    "enabled": false,
    "minimum_version": "1.0.0",
    "message": "A new version is available with important improvements. Please update to continue."
  }', 'Controls forced app updates. When enabled, users below minimum_version will be blocked until they update.')
ON CONFLICT (key) DO NOTHING;

-- Auto-update timestamp trigger
CREATE TRIGGER app_config_updated_at
  BEFORE UPDATE ON app_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 3. CLEAN UP ORPHANED SUBSCRIPTIONS
-- Remove subscriptions where the profile doesn't exist
-- ============================================

DELETE FROM subscriptions s
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = s.user_id);

-- ============================================
-- 4. ADD FOREIGN KEY FROM SUBSCRIPTIONS TO PROFILES
-- This ensures subscriptions can only exist if a profile exists
-- ============================================

-- First, check if the constraint already exists and drop if it does
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_subscriptions_profile' 
    AND table_name = 'subscriptions'
  ) THEN
    ALTER TABLE subscriptions DROP CONSTRAINT fk_subscriptions_profile;
  END IF;
END $$;

-- Add the foreign key constraint
-- ON DELETE CASCADE means if a profile is deleted, the subscription is also deleted
ALTER TABLE subscriptions
ADD CONSTRAINT fk_subscriptions_profile
FOREIGN KEY (user_id) REFERENCES profiles(id)
ON DELETE CASCADE;

-- ============================================
-- 5. UPDATE HANDLE_NEW_USER TRIGGER
-- Ensure new users get proper profile with trial start
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    email, 
    created_at, 
    onboarding_completed, 
    trial_started_at
  )
  VALUES (
    NEW.id, 
    NEW.email, 
    NOW(), 
    FALSE,  -- Will be set to TRUE after onboarding is completed
    NOW()   -- Start trial immediately when account is created
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 6. ADMIN VIEW FOR USER VERSIONS
-- Shows all users and their update status
-- ============================================

CREATE OR REPLACE VIEW admin_user_versions AS
SELECT 
  p.id,
  p.email,
  p.current_app_version,
  p.last_app_open,
  p.created_at,
  p.onboarding_completed,
  CASE 
    WHEN p.current_app_version IS NULL THEN 'unknown'
    WHEN p.current_app_version < (
      SELECT value->>'minimum_version' 
      FROM app_config 
      WHERE key = 'force_update'
    ) THEN 'needs_update'
    ELSE 'up_to_date'
  END as update_status
FROM profiles p
ORDER BY p.last_app_open DESC NULLS LAST;

-- Grant access to admin view
GRANT SELECT ON admin_user_versions TO authenticated;

-- ============================================
-- 7. FUNCTION TO GET APP CONFIG
-- Helper function for fetching app config safely
-- ============================================

CREATE OR REPLACE FUNCTION get_app_config(p_key TEXT)
RETURNS JSONB AS $$
DECLARE
  v_value JSONB;
BEGIN
  SELECT value INTO v_value
  FROM app_config
  WHERE key = p_key;
  
  RETURN COALESCE(v_value, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. FUNCTION TO CHECK IF USER NEEDS UPDATE
-- Called by the app to determine if force update should be shown
-- ============================================

CREATE OR REPLACE FUNCTION check_force_update(p_app_version TEXT)
RETURNS JSONB AS $$
DECLARE
  v_config JSONB;
  v_enabled BOOLEAN;
  v_min_version TEXT;
  v_message TEXT;
  v_needs_update BOOLEAN;
BEGIN
  -- Get force update config
  SELECT value INTO v_config
  FROM app_config
  WHERE key = 'force_update';
  
  -- Parse config values
  v_enabled := COALESCE((v_config->>'enabled')::BOOLEAN, false);
  v_min_version := COALESCE(v_config->>'minimum_version', '1.0.0');
  v_message := COALESCE(v_config->>'message', 'Please update your app to continue.');
  
  -- Check if update is needed (simple string comparison works for semver)
  v_needs_update := v_enabled AND (p_app_version < v_min_version);
  
  RETURN jsonb_build_object(
    'needs_update', v_needs_update,
    'enabled', v_enabled,
    'minimum_version', v_min_version,
    'current_version', p_app_version,
    'message', v_message
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. FUNCTION TO REPORT APP VERSION
-- Called by the app on startup to track user versions
-- ============================================

CREATE OR REPLACE FUNCTION report_app_version(p_user_id UUID, p_app_version TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET 
    current_app_version = p_app_version,
    last_app_open = NOW(),
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE app_config IS 'Centralized configuration for app-wide settings like force update';
COMMENT ON COLUMN app_config.key IS 'Unique key for the configuration setting';
COMMENT ON COLUMN app_config.value IS 'JSON value containing the configuration';

COMMENT ON COLUMN profiles.current_app_version IS 'The app version the user is currently running';
COMMENT ON COLUMN profiles.last_app_open IS 'When the user last opened the app';

COMMENT ON FUNCTION get_app_config IS 'Safely fetches an app config value by key';
COMMENT ON FUNCTION check_force_update IS 'Checks if a given app version requires force update';
COMMENT ON FUNCTION report_app_version IS 'Updates the users current app version in their profile';

COMMENT ON VIEW admin_user_versions IS 'Admin view showing all users and their app version status';

