-- ============================================
-- SUBSCRIPTION STATUS HELPERS MIGRATION
-- Single source of truth for active subscription statuses
-- ============================================

-- ============================================
-- DEFINE ACTIVE SUBSCRIPTION STATUSES
-- This is the SINGLE SOURCE OF TRUTH for backend
-- ============================================

-- Note: PostgreSQL doesn't have persistent constants, so we define
-- the active statuses directly in the functions. The authoritative
-- list is: 'active', 'trialing'

-- ============================================
-- UPDATE can_user_record FUNCTION
-- Now checks for both 'active' AND 'trialing' statuses
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
  -- Active subscription statuses (single source of truth)
  v_active_statuses TEXT[] := ARRAY['active', 'trialing'];
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
  
  -- Calculate days remaining
  v_trial_days_remaining := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_trial_expires_at - NOW())) / 86400)::INTEGER);

  -- Check subscription status
  SELECT status INTO v_subscription_status
  FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Check if status is in active statuses array
  v_has_subscription := v_subscription_status = ANY(v_active_statuses);

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
-- UPDATE can_access_features FUNCTION
-- Now checks for both 'active' AND 'trialing' statuses
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
  -- Active subscription statuses (single source of truth)
  v_active_statuses TEXT[] := ARRAY['active', 'trialing'];
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
  
  -- Calculate days remaining
  v_trial_days_remaining := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_trial_expires_at - NOW())) / 86400)::INTEGER);

  -- Check subscription status
  SELECT status INTO v_subscription_status
  FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Check if status is in active statuses array
  v_has_subscription := v_subscription_status = ANY(v_active_statuses);
  
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

COMMENT ON FUNCTION can_user_record IS 'Checks if user can record. Active statuses: active, trialing';
COMMENT ON FUNCTION can_access_features IS 'Checks if user can access features. Active statuses: active, trialing';

