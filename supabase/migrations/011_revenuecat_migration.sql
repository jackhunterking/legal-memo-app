-- ============================================
-- REVENUECAT PAYMENT INTEGRATION
-- Migration from Polar to RevenueCat
-- ============================================

-- ============================================
-- RENAME POLAR COLUMNS TO REVENUECAT
-- ============================================

-- Rename columns in subscriptions table
ALTER TABLE subscriptions RENAME COLUMN polar_subscription_id TO revenuecat_subscription_id;
ALTER TABLE subscriptions RENAME COLUMN polar_customer_id TO revenuecat_customer_id;

-- Add new columns for RevenueCat-specific data
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS original_transaction_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS store TEXT DEFAULT 'app_store';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'production';

-- Update status check constraint to include RevenueCat statuses
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check 
  CHECK (status IN ('active', 'canceled', 'expired', 'billing_issue', 'trialing', 'past_due', 'incomplete'));

-- Rename column in profiles table
ALTER TABLE profiles RENAME COLUMN polar_customer_id TO revenuecat_customer_id;

-- Rename column in usage_transactions table
ALTER TABLE usage_transactions RENAME COLUMN polar_event_id TO revenuecat_event_id;

-- ============================================
-- UPDATE INDEXES
-- ============================================

-- Drop old polar indexes
DROP INDEX IF EXISTS idx_subscriptions_polar_subscription_id;
DROP INDEX IF EXISTS idx_subscriptions_polar_customer_id;
DROP INDEX IF EXISTS idx_profiles_polar_customer_id;

-- Create new revenuecat indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_revenuecat_subscription_id ON subscriptions(revenuecat_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_revenuecat_customer_id ON subscriptions(revenuecat_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_original_transaction_id ON subscriptions(original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_product_id ON subscriptions(product_id);
CREATE INDEX IF NOT EXISTS idx_profiles_revenuecat_customer_id ON profiles(revenuecat_customer_id);

-- ============================================
-- UPDATE COMMENTS
-- ============================================

COMMENT ON COLUMN profiles.revenuecat_customer_id IS 'RevenueCat customer ID (app_user_id) for payment integration';

COMMENT ON COLUMN subscriptions.revenuecat_subscription_id IS 'RevenueCat subscription ID';
COMMENT ON COLUMN subscriptions.revenuecat_customer_id IS 'RevenueCat customer ID (app_user_id)';
COMMENT ON COLUMN subscriptions.original_transaction_id IS 'App Store original transaction ID for purchase identification';
COMMENT ON COLUMN subscriptions.product_id IS 'RevenueCat product ID';
COMMENT ON COLUMN subscriptions.store IS 'Store where purchase was made (app_store, play_store, etc.)';
COMMENT ON COLUMN subscriptions.environment IS 'Purchase environment (production, sandbox)';

COMMENT ON COLUMN usage_transactions.revenuecat_event_id IS 'RevenueCat webhook event ID';

COMMENT ON TABLE subscriptions IS 'Tracks RevenueCat subscription status for each user';

-- ============================================
-- UPDATE FUNCTIONS FOR REVENUECAT
-- ============================================

-- Update record_usage function to use revenuecat_event_id
CREATE OR REPLACE FUNCTION record_usage(
  p_user_id UUID,
  p_meeting_id UUID,
  p_minutes INTEGER,
  p_is_free_trial BOOLEAN DEFAULT false,
  p_revenuecat_event_id TEXT DEFAULT NULL
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
  INSERT INTO usage_transactions (user_id, meeting_id, minutes, transaction_type, description, revenuecat_event_id)
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
    p_revenuecat_event_id
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

COMMENT ON FUNCTION record_usage IS 'Records usage minutes, handles free trial deduction, and logs transaction with RevenueCat event ID';

