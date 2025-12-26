-- ============================================
-- POLAR-ONLY CLEANUP MIGRATION
-- Removes all RevenueCat columns and consolidates on Polar
-- ============================================

-- ============================================
-- REMOVE REVENUECAT COLUMNS FROM SUBSCRIPTIONS
-- ============================================

ALTER TABLE subscriptions DROP COLUMN IF EXISTS revenuecat_subscription_id;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS revenuecat_customer_id;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS original_transaction_id;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS product_id;

-- Update store check constraint to only allow 'polar'
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_store_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_store_check 
  CHECK (store IS NULL OR store = 'polar');

-- Set default store to 'polar'
ALTER TABLE subscriptions ALTER COLUMN store SET DEFAULT 'polar';

-- ============================================
-- REMOVE REVENUECAT COLUMN FROM PROFILES
-- ============================================

ALTER TABLE profiles DROP COLUMN IF EXISTS revenuecat_customer_id;

-- ============================================
-- REMOVE REVENUECAT COLUMN FROM USAGE_TRANSACTIONS
-- ============================================

ALTER TABLE usage_transactions DROP COLUMN IF EXISTS revenuecat_event_id;

-- ============================================
-- DROP REVENUECAT INDEXES
-- ============================================

DROP INDEX IF EXISTS idx_subscriptions_revenuecat_subscription_id;
DROP INDEX IF EXISTS idx_subscriptions_revenuecat_customer_id;
DROP INDEX IF EXISTS idx_subscriptions_original_transaction_id;
DROP INDEX IF EXISTS idx_subscriptions_product_id;
DROP INDEX IF EXISTS idx_profiles_revenuecat_customer_id;

-- ============================================
-- UPDATE FUNCTIONS - DROP OLD AND CREATE NEW
-- ============================================

-- Drop the old record_usage function with its specific signature
DROP FUNCTION IF EXISTS record_usage(UUID, UUID, INTEGER, BOOLEAN, TEXT, TEXT);

-- Create new simplified record_usage function
CREATE OR REPLACE FUNCTION record_usage(
  p_user_id UUID,
  p_meeting_id UUID,
  p_minutes INTEGER,
  p_is_free_trial BOOLEAN DEFAULT false,
  p_polar_event_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_free_minutes_remaining INTEGER;
  v_has_subscription BOOLEAN;
  v_minutes_from_free_trial INTEGER := 0;
  v_minutes_from_subscription INTEGER := 0;
BEGIN
  -- Get user's free trial status
  SELECT free_trial_minutes_remaining, has_free_trial
  INTO v_free_minutes_remaining, v_has_subscription
  FROM profiles
  WHERE id = p_user_id;

  -- Check if user has active subscription
  SELECT EXISTS(
    SELECT 1 FROM subscriptions
    WHERE user_id = p_user_id AND status = 'active'
  ) INTO v_has_subscription;

  -- If using free trial
  IF p_is_free_trial AND v_free_minutes_remaining > 0 THEN
    v_minutes_from_free_trial := LEAST(p_minutes, v_free_minutes_remaining);
    
    -- Deduct from free trial
    UPDATE profiles
    SET free_trial_minutes_remaining = free_trial_minutes_remaining - v_minutes_from_free_trial,
        has_free_trial = (free_trial_minutes_remaining - v_minutes_from_free_trial) > 0
    WHERE id = p_user_id;
  END IF;

  -- Remaining minutes go to subscription/overage
  v_minutes_from_subscription := p_minutes - v_minutes_from_free_trial;

  -- Update usage_credits
  INSERT INTO usage_credits (user_id, minutes_used_this_period, lifetime_minutes_used, last_usage_at)
  VALUES (p_user_id, v_minutes_from_subscription, p_minutes, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    minutes_used_this_period = usage_credits.minutes_used_this_period + v_minutes_from_subscription,
    lifetime_minutes_used = usage_credits.lifetime_minutes_used + p_minutes,
    last_usage_at = NOW(),
    updated_at = NOW();

  -- Record transaction
  INSERT INTO usage_transactions (user_id, meeting_id, minutes, transaction_type, description, polar_event_id)
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
    p_polar_event_id
  );

  -- Return result
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

-- Update can_user_record function
CREATE OR REPLACE FUNCTION can_user_record(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_has_subscription BOOLEAN;
  v_subscription_status TEXT;
  v_free_trial_remaining INTEGER;
  v_has_free_trial BOOLEAN;
BEGIN
  -- Get free trial status
  SELECT has_free_trial, free_trial_minutes_remaining
  INTO v_has_free_trial, v_free_trial_remaining
  FROM profiles
  WHERE id = p_user_id;

  -- Check subscription status
  SELECT status INTO v_subscription_status
  FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_has_subscription := v_subscription_status = 'active';

  -- User can record if they have free trial minutes OR active subscription
  RETURN jsonb_build_object(
    'can_record', (COALESCE(v_free_trial_remaining, 0) > 0) OR v_has_subscription,
    'has_free_trial', COALESCE(v_has_free_trial, true),
    'free_trial_remaining', COALESCE(v_free_trial_remaining, 15),
    'has_subscription', v_has_subscription,
    'subscription_status', v_subscription_status,
    'reason', CASE
      WHEN v_has_subscription THEN 'active_subscription'
      WHEN COALESCE(v_free_trial_remaining, 0) > 0 THEN 'free_trial'
      ELSE 'no_credits'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATE TABLE COMMENTS
-- ============================================

COMMENT ON TABLE subscriptions IS 'Tracks Polar subscription status for each user';
COMMENT ON COLUMN subscriptions.polar_subscription_id IS 'Polar subscription ID';
COMMENT ON COLUMN subscriptions.polar_customer_id IS 'Polar customer ID';
COMMENT ON COLUMN subscriptions.store IS 'Payment store (polar only)';

COMMENT ON COLUMN profiles.polar_customer_id IS 'Polar customer ID for payment integration';

COMMENT ON COLUMN usage_transactions.polar_event_id IS 'Polar webhook event ID';

COMMENT ON FUNCTION record_usage IS 'Records usage minutes, handles free trial deduction, and logs transaction with Polar event ID';
COMMENT ON FUNCTION can_user_record IS 'Checks if user has credits available to record (free trial or active Polar subscription)';

