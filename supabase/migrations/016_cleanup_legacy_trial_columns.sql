-- ============================================
-- CLEANUP: Remove Legacy Minute-Based Trial Columns
-- The app now uses time-based trials (7 days unlimited)
-- These columns are no longer used
-- Applied: 2024-12-27
-- ============================================

-- Step 1: Drop the legacy columns from profiles table
ALTER TABLE profiles DROP COLUMN IF EXISTS has_free_trial;
ALTER TABLE profiles DROP COLUMN IF EXISTS free_trial_minutes_remaining;

-- Step 2: Simplify the record_usage function (no more minute-based trial logic)
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
  v_has_subscription BOOLEAN;
BEGIN
  -- Check if user has active subscription
  SELECT EXISTS(
    SELECT 1 FROM subscriptions
    WHERE user_id = p_user_id AND status = 'active'
  ) INTO v_has_subscription;

  -- Update usage_credits (track lifetime usage for analytics)
  INSERT INTO usage_credits (user_id, minutes_used_this_period, lifetime_minutes_used, last_usage_at)
  VALUES (p_user_id, p_minutes, p_minutes, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    minutes_used_this_period = usage_credits.minutes_used_this_period + p_minutes,
    lifetime_minutes_used = usage_credits.lifetime_minutes_used + p_minutes,
    last_usage_at = NOW(),
    updated_at = NOW();

  -- Record transaction for audit trail
  INSERT INTO usage_transactions (user_id, meeting_id, minutes, transaction_type, description, polar_event_id)
  VALUES (
    p_user_id,
    p_meeting_id,
    p_minutes,
    'recording',
    format('Recording usage: %s minutes', p_minutes),
    p_polar_event_id
  );

  -- Return result
  v_result := jsonb_build_object(
    'success', true,
    'minutes_recorded', p_minutes,
    'has_subscription', v_has_subscription
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION record_usage IS 'Records usage minutes for analytics and audit trail. Trial is time-based (7 days unlimited), not minute-based.';

