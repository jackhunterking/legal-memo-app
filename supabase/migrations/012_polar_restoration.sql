-- ============================================
-- POLAR PAYMENT INTEGRATION RESTORATION
-- Adding Polar support for web checkout (replacing RevenueCat)
-- ============================================

-- ============================================
-- ADD POLAR COLUMNS TO SUBSCRIPTIONS
-- ============================================

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS polar_subscription_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS polar_customer_id TEXT;

-- ============================================
-- ADD POLAR COLUMNS TO PROFILES
-- ============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS polar_customer_id TEXT;

-- ============================================
-- ADD POLAR EVENT ID COLUMN TO USAGE_TRANSACTIONS
-- ============================================

ALTER TABLE usage_transactions ADD COLUMN IF NOT EXISTS polar_event_id TEXT;

-- ============================================
-- CREATE INDEXES FOR POLAR LOOKUPS
-- ============================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_polar_subscription_id 
  ON subscriptions(polar_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_polar_customer_id 
  ON subscriptions(polar_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_polar_customer_id 
  ON profiles(polar_customer_id);
CREATE INDEX IF NOT EXISTS idx_usage_transactions_polar_event_id 
  ON usage_transactions(polar_event_id);

-- ============================================
-- UPDATE COMMENTS
-- ============================================

COMMENT ON COLUMN profiles.polar_customer_id IS 'Polar customer ID for web checkout payment integration';
COMMENT ON COLUMN subscriptions.polar_subscription_id IS 'Polar subscription ID for web checkout purchases';
COMMENT ON COLUMN subscriptions.polar_customer_id IS 'Polar customer ID';
COMMENT ON COLUMN usage_transactions.polar_event_id IS 'Polar webhook event ID';

-- ============================================
-- DROP OLD FUNCTION AND CREATE NEW ONE WITH POLAR SUPPORT
-- ============================================

DROP FUNCTION IF EXISTS record_usage(UUID, UUID, INTEGER, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION record_usage(
  p_user_id UUID,
  p_meeting_id UUID,
  p_minutes INTEGER,
  p_is_free_trial BOOLEAN DEFAULT false,
  p_event_id TEXT DEFAULT NULL,
  p_event_source TEXT DEFAULT 'polar'
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_free_minutes_remaining INTEGER;
  v_has_subscription BOOLEAN;
  v_minutes_from_free_trial INTEGER := 0;
  v_minutes_from_subscription INTEGER := 0;
BEGIN
  SELECT free_trial_minutes_remaining, has_free_trial
  INTO v_free_minutes_remaining, v_has_subscription
  FROM profiles
  WHERE id = p_user_id;

  SELECT EXISTS(
    SELECT 1 FROM subscriptions
    WHERE user_id = p_user_id AND status = 'active'
  ) INTO v_has_subscription;

  IF p_is_free_trial AND v_free_minutes_remaining > 0 THEN
    v_minutes_from_free_trial := LEAST(p_minutes, v_free_minutes_remaining);
    
    UPDATE profiles
    SET free_trial_minutes_remaining = free_trial_minutes_remaining - v_minutes_from_free_trial,
        has_free_trial = (free_trial_minutes_remaining - v_minutes_from_free_trial) > 0
    WHERE id = p_user_id;
  END IF;

  v_minutes_from_subscription := p_minutes - v_minutes_from_free_trial;

  INSERT INTO usage_credits (user_id, minutes_used_this_period, lifetime_minutes_used, last_usage_at)
  VALUES (p_user_id, v_minutes_from_subscription, p_minutes, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    minutes_used_this_period = usage_credits.minutes_used_this_period + v_minutes_from_subscription,
    lifetime_minutes_used = usage_credits.lifetime_minutes_used + p_minutes,
    last_usage_at = NOW(),
    updated_at = NOW();

  INSERT INTO usage_transactions (
    user_id, meeting_id, minutes, transaction_type, description, polar_event_id, revenuecat_event_id
  )
  VALUES (
    p_user_id,
    p_meeting_id,
    p_minutes,
    CASE WHEN v_minutes_from_free_trial > 0 THEN 'free_trial' ELSE 'recording' END,
    CASE 
      WHEN v_minutes_from_free_trial > 0 THEN 
        format('Free trial: %s min, Subscription: %s min', v_minutes_from_free_trial, v_minutes_from_subscription)
      ELSE 
        format('Recording usage: %s minutes', p_minutes)
    END,
    CASE WHEN p_event_source = 'polar' THEN p_event_id ELSE NULL END,
    CASE WHEN p_event_source = 'revenuecat' THEN p_event_id ELSE NULL END
  );

  v_result := jsonb_build_object(
    'success', true,
    'minutes_recorded', p_minutes,
    'minutes_from_free_trial', v_minutes_from_free_trial,
    'minutes_from_subscription', v_minutes_from_subscription,
    'free_trial_remaining', GREATEST(0, COALESCE(v_free_minutes_remaining, 0) - v_minutes_from_free_trial)
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATE CAN_USER_RECORD FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION can_user_record(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_has_subscription BOOLEAN;
  v_subscription_status TEXT;
  v_subscription_store TEXT;
  v_free_trial_remaining INTEGER;
  v_has_free_trial BOOLEAN;
BEGIN
  SELECT has_free_trial, free_trial_minutes_remaining
  INTO v_has_free_trial, v_free_trial_remaining
  FROM profiles
  WHERE id = p_user_id;

  SELECT status, store INTO v_subscription_status, v_subscription_store
  FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_has_subscription := v_subscription_status = 'active';

  RETURN jsonb_build_object(
    'can_record', (COALESCE(v_free_trial_remaining, 0) > 0) OR v_has_subscription,
    'has_free_trial', COALESCE(v_has_free_trial, true),
    'free_trial_remaining', COALESCE(v_free_trial_remaining, 15),
    'has_subscription', v_has_subscription,
    'subscription_status', v_subscription_status,
    'subscription_store', v_subscription_store,
    'reason', CASE
      WHEN v_has_subscription THEN 'active_subscription'
      WHEN COALESCE(v_free_trial_remaining, 0) > 0 THEN 'free_trial'
      ELSE 'no_credits'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

