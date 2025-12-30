-- ============================================
-- CANCELLATION STATUS HANDLING MIGRATION
-- Adds support for "canceled but still active" subscription state
-- ============================================

-- ============================================
-- ADD cancellation_reason COLUMN
-- Tracks why subscription was canceled for analytics and messaging
-- ============================================

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMENT ON COLUMN subscriptions.cancellation_reason IS 'Reason for cancellation: user_requested, payment_failed, trial_ended, admin_revoked';

-- ============================================
-- UPDATE can_user_record FUNCTION
-- Now handles "canceled but still has access until period end" state
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
  v_current_period_end TIMESTAMPTZ;
  v_canceled_at TIMESTAMPTZ;
  v_is_canceling BOOLEAN;
  v_canceled_but_active BOOLEAN;
  v_access_ends_at TIMESTAMPTZ;
  v_days_until_access_ends INTEGER;
  v_cancellation_reason TEXT;
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
  
  -- Calculate days remaining in trial
  v_trial_days_remaining := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_trial_expires_at - NOW())) / 86400)::INTEGER);

  -- Check subscription status and get cancellation details
  SELECT status, current_period_end, canceled_at, cancellation_reason
  INTO v_subscription_status, v_current_period_end, v_canceled_at, v_cancellation_reason
  FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Check if status is in active statuses array
  v_has_subscription := v_subscription_status = ANY(v_active_statuses);
  
  -- Check if subscription is canceled
  v_is_canceling := v_subscription_status = 'canceled';
  
  -- Check if canceled but still has access (period hasn't ended)
  v_canceled_but_active := v_is_canceling 
    AND v_current_period_end IS NOT NULL 
    AND v_current_period_end > NOW();
  
  -- Determine when access ends
  IF v_canceled_but_active THEN
    v_access_ends_at := v_current_period_end;
    v_days_until_access_ends := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_current_period_end - NOW())) / 86400)::INTEGER);
  ELSIF v_has_subscription AND v_current_period_end IS NOT NULL THEN
    v_access_ends_at := v_current_period_end;
    v_days_until_access_ends := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_current_period_end - NOW())) / 86400)::INTEGER);
  ELSE
    v_access_ends_at := NULL;
    v_days_until_access_ends := 0;
  END IF;

  RETURN jsonb_build_object(
    'can_record', v_is_trial_active OR v_has_subscription OR v_canceled_but_active,
    'has_active_trial', v_is_trial_active,
    'trial_started_at', v_trial_started_at,
    'trial_expires_at', v_trial_expires_at,
    'trial_days_remaining', v_trial_days_remaining,
    'has_subscription', v_has_subscription OR v_canceled_but_active,
    'subscription_status', v_subscription_status,
    'is_canceling', v_is_canceling,
    'canceled_but_active', v_canceled_but_active,
    'canceled_at', v_canceled_at,
    'cancellation_reason', v_cancellation_reason,
    'access_ends_at', v_access_ends_at,
    'days_until_access_ends', v_days_until_access_ends,
    'current_period_end', v_current_period_end,
    'reason', CASE
      WHEN v_has_subscription THEN 'active_subscription'
      WHEN v_canceled_but_active THEN 'canceled_but_active'
      WHEN v_is_trial_active THEN 'active_trial'
      ELSE 'trial_expired'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATE can_access_features FUNCTION
-- Now handles "canceled but still has access until period end" state
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
  v_current_period_end TIMESTAMPTZ;
  v_canceled_at TIMESTAMPTZ;
  v_is_canceling BOOLEAN;
  v_canceled_but_active BOOLEAN;
  v_access_ends_at TIMESTAMPTZ;
  v_days_until_access_ends INTEGER;
  v_cancellation_reason TEXT;
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
  
  -- Calculate days remaining in trial
  v_trial_days_remaining := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_trial_expires_at - NOW())) / 86400)::INTEGER);

  -- Check subscription status and get cancellation details
  SELECT status, current_period_end, canceled_at, cancellation_reason
  INTO v_subscription_status, v_current_period_end, v_canceled_at, v_cancellation_reason
  FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Check if status is in active statuses array
  v_has_subscription := v_subscription_status = ANY(v_active_statuses);
  
  -- Check if subscription is canceled
  v_is_canceling := v_subscription_status = 'canceled';
  
  -- Check if canceled but still has access (period hasn't ended)
  v_canceled_but_active := v_is_canceling 
    AND v_current_period_end IS NOT NULL 
    AND v_current_period_end > NOW();
  
  -- Determine when access ends
  IF v_canceled_but_active THEN
    v_access_ends_at := v_current_period_end;
    v_days_until_access_ends := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_current_period_end - NOW())) / 86400)::INTEGER);
  ELSIF v_has_subscription AND v_current_period_end IS NOT NULL THEN
    v_access_ends_at := v_current_period_end;
    v_days_until_access_ends := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_current_period_end - NOW())) / 86400)::INTEGER);
  ELSE
    v_access_ends_at := NULL;
    v_days_until_access_ends := 0;
  END IF;
  
  -- Can access if trial active OR has subscription OR canceled but still in period
  v_can_access := v_is_trial_active OR v_has_subscription OR v_canceled_but_active;

  RETURN jsonb_build_object(
    'can_access', v_can_access,
    'has_active_trial', v_is_trial_active,
    'trial_started_at', v_trial_started_at,
    'trial_expires_at', v_trial_expires_at,
    'trial_days_remaining', v_trial_days_remaining,
    'has_subscription', v_has_subscription OR v_canceled_but_active,
    'subscription_status', v_subscription_status,
    'is_canceling', v_is_canceling,
    'canceled_but_active', v_canceled_but_active,
    'canceled_at', v_canceled_at,
    'cancellation_reason', v_cancellation_reason,
    'access_ends_at', v_access_ends_at,
    'days_until_access_ends', v_days_until_access_ends,
    'current_period_end', v_current_period_end,
    'reason', CASE
      WHEN v_has_subscription THEN 'active_subscription'
      WHEN v_canceled_but_active THEN 'canceled_but_active'
      WHEN v_is_trial_active THEN 'active_trial'
      ELSE 'trial_expired'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATE COMMENTS
-- ============================================

COMMENT ON FUNCTION can_user_record IS 'Checks if user can record. Active statuses: active, trialing. Also grants access for canceled subscriptions until period_end.';
COMMENT ON FUNCTION can_access_features IS 'Checks if user can access features. Active statuses: active, trialing. Also grants access for canceled subscriptions until period_end.';

