-- ============================================
-- POLAR PAYMENT INTEGRATION
-- Migration for credits, subscriptions, and usage tracking
-- ============================================

-- ============================================
-- SUBSCRIPTIONS TABLE
-- Track Polar subscription status
-- ============================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  polar_subscription_id TEXT NOT NULL,
  polar_customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete', 'trialing')),
  plan_name TEXT DEFAULT 'standard',
  monthly_minutes_included INTEGER DEFAULT 10,
  overage_rate_cents INTEGER DEFAULT 100, -- $1.00 per minute in cents
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USAGE CREDITS TABLE
-- Track user usage per billing period
-- ============================================

CREATE TABLE IF NOT EXISTS usage_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  minutes_used_this_period INTEGER DEFAULT 0,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  lifetime_minutes_used INTEGER DEFAULT 0,
  last_usage_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USAGE TRANSACTIONS TABLE
-- Audit log for all usage events
-- ============================================

CREATE TABLE IF NOT EXISTS usage_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  minutes INTEGER NOT NULL,
  transaction_type TEXT NOT NULL
    CHECK (transaction_type IN ('recording', 'free_trial', 'subscription_reset', 'adjustment')),
  description TEXT,
  polar_event_id TEXT, -- ID returned from Polar meter API
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ADD COLUMNS TO PROFILES TABLE
-- ============================================

-- Polar customer ID for linking to Polar
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS polar_customer_id TEXT;

-- Free trial tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_free_trial BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS free_trial_minutes_remaining INTEGER DEFAULT 15;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_polar_subscription_id ON subscriptions(polar_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_polar_customer_id ON subscriptions(polar_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_usage_credits_user_id ON usage_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_credits_period ON usage_credits(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_usage_transactions_user_id ON usage_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_transactions_meeting_id ON usage_transactions(meeting_id);
CREATE INDEX IF NOT EXISTS idx_usage_transactions_created_at ON usage_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_polar_customer_id ON profiles(polar_customer_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_transactions ENABLE ROW LEVEL SECURITY;

-- Subscriptions policies
CREATE POLICY "Users can view own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscriptions" ON subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- Usage credits policies
CREATE POLICY "Users can view own usage" ON usage_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own usage" ON usage_credits
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage usage" ON usage_credits
  FOR ALL USING (auth.role() = 'service_role');

-- Usage transactions policies
CREATE POLICY "Users can view own transactions" ON usage_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage transactions" ON usage_transactions
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp for subscriptions
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-update updated_at timestamp for usage_credits
CREATE TRIGGER usage_credits_updated_at
  BEFORE UPDATE ON usage_credits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- FUNCTION: Create usage_credits record for new users
-- ============================================

CREATE OR REPLACE FUNCTION create_usage_credits_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO usage_credits (user_id, minutes_used_this_period, lifetime_minutes_used)
  VALUES (NEW.id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create usage_credits when profile is created
CREATE TRIGGER on_profile_created_create_usage
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION create_usage_credits_for_user();

-- ============================================
-- FUNCTION: Record usage and update credits
-- ============================================

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

-- ============================================
-- FUNCTION: Reset usage for new billing period
-- ============================================

CREATE OR REPLACE FUNCTION reset_usage_period(
  p_user_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
)
RETURNS VOID AS $$
BEGIN
  UPDATE usage_credits
  SET 
    minutes_used_this_period = 0,
    period_start = p_period_start,
    period_end = p_period_end,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Record the reset as a transaction
  INSERT INTO usage_transactions (user_id, minutes, transaction_type, description)
  VALUES (p_user_id, 0, 'subscription_reset', format('Billing period reset: %s to %s', p_period_start, p_period_end));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Check if user can record
-- ============================================

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
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE subscriptions IS 'Tracks Polar subscription status for each user';
COMMENT ON TABLE usage_credits IS 'Tracks usage minutes per billing period';
COMMENT ON TABLE usage_transactions IS 'Audit log of all usage events';

COMMENT ON COLUMN profiles.polar_customer_id IS 'Polar customer ID for payment integration';
COMMENT ON COLUMN profiles.has_free_trial IS 'Whether user still has free trial available';
COMMENT ON COLUMN profiles.free_trial_minutes_remaining IS 'Minutes remaining in free trial (starts at 15)';

COMMENT ON COLUMN subscriptions.overage_rate_cents IS 'Cost per minute overage in cents (default $1.00 = 100 cents)';
COMMENT ON COLUMN subscriptions.monthly_minutes_included IS 'Minutes included in subscription per month';

COMMENT ON FUNCTION record_usage IS 'Records usage minutes, handles free trial deduction, and logs transaction';
COMMENT ON FUNCTION reset_usage_period IS 'Resets usage counter for new billing period';
COMMENT ON FUNCTION can_user_record IS 'Checks if user has credits available to record';

