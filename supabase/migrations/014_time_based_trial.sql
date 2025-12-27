-- ============================================
-- TIME-BASED FREE TRIAL MIGRATION
-- Migration from 15-minute usage-based trial to 7-day time-based trial
-- ============================================

-- ============================================
-- ADD TRIAL START TIMESTAMP TO PROFILES
-- ============================================

-- Add trial_started_at column to track when trial began
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;

-- Migrate existing users: set trial_started_at to their account creation date
-- This ensures existing users get credit for time since signup
UPDATE profiles 
SET trial_started_at = created_at 
WHERE trial_started_at IS NULL;

-- Set default for new users - trial starts when they sign up
ALTER TABLE profiles ALTER COLUMN trial_started_at SET DEFAULT NOW();

-- ============================================
-- UPDATE CAN_USER_RECORD FUNCTION
-- Now checks time-based trial instead of minutes-based
-- ============================================

CREATE OR REPLACE FUNCTION can_user_record(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_has_subscription BOOLEAN;
  v_subscription_status TEXT;
  v_trial_started_at TIMESTAMPTZ;
  v_trial_expires_at TIMESTAMPTZ;
  v_trial_days_remaining INTEGER;
  v_is_trial_active BOOLEAN;
BEGIN
  -- Get trial start date from profile
  SELECT trial_started_at
  INTO v_trial_started_at
  FROM profiles
  WHERE id = p_user_id;

  -- Calculate trial expiration (7 days from start)
  v_trial_expires_at := v_trial_started_at + INTERVAL '7 days';
  
  -- Check if trial is still active
  v_is_trial_active := v_trial_expires_at > NOW();
  
  -- Calculate days remaining using CEIL for consistency with TypeScript Math.ceil()
  v_trial_days_remaining := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_trial_expires_at - NOW())) / 86400)::INTEGER);

  -- Check subscription status
  SELECT status INTO v_subscription_status
  FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_has_subscription := v_subscription_status = 'active';

  -- User can record if they have active trial OR active subscription
  RETURN jsonb_build_object(
    'can_record', v_is_trial_active OR v_has_subscription,
    'has_active_trial', v_is_trial_active,
    'trial_started_at', v_trial_started_at,
    'trial_expires_at', v_trial_expires_at,
    'trial_days_remaining', v_trial_days_remaining,
    'has_subscription', v_has_subscription,
    'subscription_status', v_subscription_status,
    'reason', CASE
      WHEN v_has_subscription THEN 'active_subscription'
      WHEN v_is_trial_active THEN 'active_trial'
      ELSE 'trial_expired'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- CREATE CAN_ACCESS_FEATURES FUNCTION
-- Unified access check for all premium features
-- ============================================

CREATE OR REPLACE FUNCTION can_access_features(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_has_subscription BOOLEAN;
  v_subscription_status TEXT;
  v_trial_started_at TIMESTAMPTZ;
  v_trial_expires_at TIMESTAMPTZ;
  v_trial_days_remaining INTEGER;
  v_is_trial_active BOOLEAN;
  v_can_access BOOLEAN;
BEGIN
  -- Get trial start date from profile
  SELECT trial_started_at
  INTO v_trial_started_at
  FROM profiles
  WHERE id = p_user_id;

  -- Calculate trial expiration (7 days from start)
  v_trial_expires_at := v_trial_started_at + INTERVAL '7 days';
  
  -- Check if trial is still active
  v_is_trial_active := v_trial_expires_at > NOW();
  
  -- Calculate days remaining using CEIL for consistency with TypeScript Math.ceil()
  v_trial_days_remaining := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_trial_expires_at - NOW())) / 86400)::INTEGER);

  -- Check subscription status
  SELECT status INTO v_subscription_status
  FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_has_subscription := v_subscription_status = 'active';
  
  -- Can access if trial active OR has subscription
  v_can_access := v_is_trial_active OR v_has_subscription;

  RETURN jsonb_build_object(
    'can_access', v_can_access,
    'has_active_trial', v_is_trial_active,
    'trial_started_at', v_trial_started_at,
    'trial_expires_at', v_trial_expires_at,
    'trial_days_remaining', v_trial_days_remaining,
    'has_subscription', v_has_subscription,
    'subscription_status', v_subscription_status,
    'reason', CASE
      WHEN v_has_subscription THEN 'active_subscription'
      WHEN v_is_trial_active THEN 'active_trial'
      ELSE 'trial_expired'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATE COMMENTS
-- ============================================

COMMENT ON COLUMN profiles.trial_started_at IS 'Timestamp when the 7-day free trial started';
COMMENT ON FUNCTION can_user_record IS 'Checks if user can record - requires active trial OR subscription';
COMMENT ON FUNCTION can_access_features IS 'Checks if user can access premium features - requires active trial OR subscription';

-- ============================================
-- INDEX FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_trial_started_at ON profiles(trial_started_at);

