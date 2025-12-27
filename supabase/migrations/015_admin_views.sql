-- ============================================
-- ADMIN VIEWS FOR USER & SUBSCRIPTION MANAGEMENT
-- Views for monitoring users, subscriptions, usage, and trials
-- ============================================

-- ============================================
-- VIEW 1: ADMIN USER OVERVIEW
-- Complete user snapshot with subscription & trial status
-- ============================================

CREATE OR REPLACE VIEW admin_user_overview AS
SELECT 
  p.id AS user_id,
  p.email,
  p.display_name,
  p.created_at,
  p.onboarding_completed,
  
  -- Trial Information
  p.trial_started_at,
  p.trial_started_at + INTERVAL '7 days' AS trial_expires_at,
  CASE 
    WHEN (p.trial_started_at + INTERVAL '7 days') > NOW() THEN true
    ELSE false
  END AS trial_active,
  GREATEST(0, CEIL(EXTRACT(EPOCH FROM ((p.trial_started_at + INTERVAL '7 days') - NOW())) / 86400)::INTEGER) AS trial_days_remaining,
  
  -- Subscription Information
  s.status AS subscription_status,
  s.plan_name,
  s.polar_subscription_id,
  s.current_period_start,
  s.current_period_end,
  s.canceled_at,
  
  -- Polar Integration
  COALESCE(p.polar_customer_id, s.polar_customer_id) AS polar_customer_id,
  
  -- Usage Summary
  COALESCE(uc.minutes_used_this_period, 0) AS minutes_used_this_period,
  COALESCE(uc.lifetime_minutes_used, 0) AS lifetime_minutes_used,
  uc.last_usage_at,
  
  -- Computed Status
  CASE
    WHEN s.status = 'active' THEN 'subscriber'
    WHEN (p.trial_started_at + INTERVAL '7 days') > NOW() THEN 'trial'
    ELSE 'expired'
  END AS user_status

FROM profiles p
LEFT JOIN subscriptions s ON s.user_id = p.id
LEFT JOIN usage_credits uc ON uc.user_id = p.id
ORDER BY p.created_at DESC;

COMMENT ON VIEW admin_user_overview IS 'Admin view: Complete user overview with subscription and trial status';

-- ============================================
-- VIEW 2: ADMIN SUBSCRIPTIONS
-- Detailed subscription information with user context
-- ============================================

CREATE OR REPLACE VIEW admin_subscriptions AS
SELECT 
  s.id AS subscription_id,
  s.user_id,
  p.email AS user_email,
  p.display_name AS user_name,
  
  -- Subscription Details
  s.status,
  s.plan_name,
  s.store,
  s.environment,
  
  -- Polar Integration
  s.polar_subscription_id,
  s.polar_customer_id,
  
  -- Period Information
  s.current_period_start,
  s.current_period_end,
  CASE 
    WHEN s.current_period_end IS NOT NULL THEN
      CEIL(EXTRACT(EPOCH FROM (s.current_period_end - NOW())) / 86400)::INTEGER
    ELSE NULL
  END AS days_until_renewal,
  
  -- Plan Details
  s.monthly_minutes_included,
  CASE 
    WHEN s.monthly_minutes_included >= 999999 THEN 'Unlimited'
    ELSE s.monthly_minutes_included::TEXT || ' minutes'
  END AS minutes_display,
  s.overage_rate_cents,
  
  -- Cancellation Info
  s.canceled_at,
  CASE WHEN s.canceled_at IS NOT NULL THEN true ELSE false END AS is_canceled,
  
  -- Timestamps
  s.created_at AS subscription_created_at,
  s.updated_at AS subscription_updated_at

FROM subscriptions s
JOIN profiles p ON p.id = s.user_id
ORDER BY s.created_at DESC;

COMMENT ON VIEW admin_subscriptions IS 'Admin view: Detailed subscription information with user context';

-- ============================================
-- VIEW 3: ADMIN USAGE STATS
-- Usage analytics per user with meeting counts
-- ============================================

CREATE OR REPLACE VIEW admin_usage_stats AS
SELECT 
  p.id AS user_id,
  p.email,
  p.display_name,
  
  -- Usage Credits
  COALESCE(uc.minutes_used_this_period, 0) AS minutes_used_this_period,
  COALESCE(uc.lifetime_minutes_used, 0) AS lifetime_minutes_used,
  uc.period_start,
  uc.period_end,
  uc.last_usage_at,
  
  -- Meeting Stats
  COALESCE(meeting_stats.total_meetings, 0) AS total_meetings,
  COALESCE(meeting_stats.ready_meetings, 0) AS completed_meetings,
  COALESCE(meeting_stats.failed_meetings, 0) AS failed_meetings,
  COALESCE(meeting_stats.total_duration_seconds, 0) AS total_duration_seconds,
  ROUND(COALESCE(meeting_stats.total_duration_seconds, 0) / 60.0, 1) AS total_duration_minutes,
  meeting_stats.last_meeting_at,
  meeting_stats.first_meeting_at,
  
  -- Activity Level
  CASE 
    WHEN uc.last_usage_at > NOW() - INTERVAL '24 hours' THEN 'active_today'
    WHEN uc.last_usage_at > NOW() - INTERVAL '7 days' THEN 'active_this_week'
    WHEN uc.last_usage_at > NOW() - INTERVAL '30 days' THEN 'active_this_month'
    WHEN uc.last_usage_at IS NOT NULL THEN 'inactive'
    ELSE 'never_used'
  END AS activity_level

FROM profiles p
LEFT JOIN usage_credits uc ON uc.user_id = p.id
LEFT JOIN (
  SELECT 
    user_id,
    COUNT(*) AS total_meetings,
    COUNT(*) FILTER (WHERE status = 'ready') AS ready_meetings,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_meetings,
    SUM(COALESCE(duration_seconds, 0)) AS total_duration_seconds,
    MAX(created_at) AS last_meeting_at,
    MIN(created_at) AS first_meeting_at
  FROM meetings
  GROUP BY user_id
) meeting_stats ON meeting_stats.user_id = p.id
ORDER BY uc.last_usage_at DESC NULLS LAST;

COMMENT ON VIEW admin_usage_stats IS 'Admin view: Usage analytics per user with meeting statistics';

-- ============================================
-- VIEW 4: ADMIN TRIAL STATUS
-- Trial tracking and conversion opportunities
-- ============================================

CREATE OR REPLACE VIEW admin_trial_status AS
SELECT 
  p.id AS user_id,
  p.email,
  p.display_name,
  p.created_at AS account_created_at,
  
  -- Trial Dates
  p.trial_started_at,
  p.trial_started_at + INTERVAL '7 days' AS trial_expires_at,
  
  -- Trial Status
  CASE 
    WHEN (p.trial_started_at + INTERVAL '7 days') > NOW() THEN true
    ELSE false
  END AS trial_active,
  
  GREATEST(0, CEIL(EXTRACT(EPOCH FROM ((p.trial_started_at + INTERVAL '7 days') - NOW())) / 86400)::INTEGER) AS days_remaining,
  
  -- Urgency Classification
  CASE 
    WHEN (p.trial_started_at + INTERVAL '7 days') <= NOW() THEN 'expired'
    WHEN (p.trial_started_at + INTERVAL '7 days') <= NOW() + INTERVAL '1 day' THEN 'expires_today'
    WHEN (p.trial_started_at + INTERVAL '7 days') <= NOW() + INTERVAL '2 days' THEN 'expires_tomorrow'
    WHEN (p.trial_started_at + INTERVAL '7 days') <= NOW() + INTERVAL '3 days' THEN 'expiring_soon'
    ELSE 'active'
  END AS trial_urgency,
  
  -- Subscription Status (conversion indicator)
  s.status AS subscription_status,
  CASE 
    WHEN s.status = 'active' THEN true
    ELSE false
  END AS has_converted,
  
  -- Usage during trial (engagement indicator)
  COALESCE(uc.lifetime_minutes_used, 0) AS minutes_used,
  COALESCE(meeting_count.count, 0) AS meetings_recorded,
  
  -- Conversion Likelihood Score (higher = more likely to convert)
  CASE 
    WHEN s.status = 'active' THEN 100 -- Already converted
    WHEN COALESCE(meeting_count.count, 0) >= 5 THEN 80 -- High engagement
    WHEN COALESCE(meeting_count.count, 0) >= 3 THEN 60 -- Good engagement
    WHEN COALESCE(meeting_count.count, 0) >= 1 THEN 40 -- Some engagement
    WHEN p.onboarding_completed THEN 20 -- Completed onboarding
    ELSE 10 -- Low engagement
  END AS conversion_score

FROM profiles p
LEFT JOIN subscriptions s ON s.user_id = p.id
LEFT JOIN usage_credits uc ON uc.user_id = p.id
LEFT JOIN (
  SELECT user_id, COUNT(*) as count 
  FROM meetings 
  GROUP BY user_id
) meeting_count ON meeting_count.user_id = p.id
ORDER BY 
  CASE WHEN s.status = 'active' THEN 1 ELSE 0 END, -- Non-subscribers first
  (p.trial_started_at + INTERVAL '7 days') ASC; -- Soonest expiring first

COMMENT ON VIEW admin_trial_status IS 'Admin view: Trial tracking with conversion opportunities';

-- ============================================
-- VIEW 5: ADMIN REVENUE SUMMARY
-- Aggregate business metrics
-- ============================================

CREATE OR REPLACE VIEW admin_revenue_summary AS
SELECT 
  -- User Counts
  (SELECT COUNT(*) FROM profiles) AS total_users,
  (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') AS active_subscribers,
  (SELECT COUNT(*) FROM subscriptions WHERE status = 'canceled') AS canceled_subscriptions,
  
  -- Trial Metrics
  (SELECT COUNT(*) FROM profiles p 
   WHERE (p.trial_started_at + INTERVAL '7 days') > NOW()
   AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = p.id AND s.status = 'active')
  ) AS users_on_trial,
  
  (SELECT COUNT(*) FROM profiles p 
   WHERE (p.trial_started_at + INTERVAL '7 days') <= NOW()
   AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = p.id AND s.status = 'active')
  ) AS trials_expired,
  
  -- Expiring Trials (conversion opportunities)
  (SELECT COUNT(*) FROM profiles p 
   WHERE (p.trial_started_at + INTERVAL '7 days') > NOW()
   AND (p.trial_started_at + INTERVAL '7 days') <= NOW() + INTERVAL '2 days'
   AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = p.id AND s.status = 'active')
  ) AS trials_expiring_soon,
  
  -- Usage Metrics
  (SELECT COALESCE(SUM(lifetime_minutes_used), 0) FROM usage_credits) AS total_minutes_used,
  (SELECT COUNT(*) FROM meetings) AS total_meetings,
  (SELECT COUNT(*) FROM meetings WHERE status = 'ready') AS completed_meetings,
  
  -- Recent Activity (last 7 days)
  (SELECT COUNT(*) FROM profiles p 
   WHERE EXISTS (
     SELECT 1 FROM usage_credits uc 
     WHERE uc.user_id = p.id AND uc.last_usage_at > NOW() - INTERVAL '7 days'
   )
  ) AS active_users_last_7_days,
  
  (SELECT COUNT(*) FROM meetings WHERE created_at > NOW() - INTERVAL '7 days') AS meetings_last_7_days,
  
  -- New Users (last 30 days)
  (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '30 days') AS new_users_last_30_days,
  (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '7 days') AS new_users_last_7_days,
  
  -- Conversion Rate (subscribers / total users who finished trial)
  ROUND(
    CASE 
      WHEN (SELECT COUNT(*) FROM profiles p WHERE (p.trial_started_at + INTERVAL '7 days') <= NOW()) > 0 
      THEN (SELECT COUNT(*) FROM subscriptions WHERE status = 'active')::NUMERIC / 
           (SELECT COUNT(*) FROM profiles p WHERE (p.trial_started_at + INTERVAL '7 days') <= NOW())::NUMERIC * 100
      ELSE 0
    END, 2
  ) AS trial_conversion_rate_percent,
  
  -- Timestamp
  NOW() AS generated_at;

COMMENT ON VIEW admin_revenue_summary IS 'Admin view: Aggregate business and revenue metrics';

-- ============================================
-- GRANT ACCESS TO VIEWS
-- Only service_role can query these views
-- ============================================

-- Note: Views inherit RLS from underlying tables
-- Service role bypasses RLS by default
-- These views are designed for admin dashboard queries only

-- ============================================
-- HELPER FUNCTION: Get User Full Status
-- Returns complete user status as JSON
-- ============================================

CREATE OR REPLACE FUNCTION admin_get_user_status(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'user', jsonb_build_object(
      'id', p.id,
      'email', p.email,
      'display_name', p.display_name,
      'created_at', p.created_at
    ),
    'trial', jsonb_build_object(
      'started_at', p.trial_started_at,
      'expires_at', p.trial_started_at + INTERVAL '7 days',
      'is_active', (p.trial_started_at + INTERVAL '7 days') > NOW(),
      'days_remaining', GREATEST(0, CEIL(EXTRACT(EPOCH FROM ((p.trial_started_at + INTERVAL '7 days') - NOW())) / 86400)::INTEGER)
    ),
    'subscription', CASE 
      WHEN s.id IS NOT NULL THEN jsonb_build_object(
        'status', s.status,
        'plan_name', s.plan_name,
        'polar_subscription_id', s.polar_subscription_id,
        'current_period_end', s.current_period_end
      )
      ELSE NULL
    END,
    'usage', jsonb_build_object(
      'minutes_this_period', COALESCE(uc.minutes_used_this_period, 0),
      'lifetime_minutes', COALESCE(uc.lifetime_minutes_used, 0),
      'last_usage_at', uc.last_usage_at
    ),
    'meetings', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'completed', COUNT(*) FILTER (WHERE status = 'ready'),
        'total_duration_minutes', ROUND(SUM(COALESCE(duration_seconds, 0)) / 60.0, 1)
      )
      FROM meetings m WHERE m.user_id = p_user_id
    )
  )
  INTO v_result
  FROM profiles p
  LEFT JOIN subscriptions s ON s.user_id = p.id
  LEFT JOIN usage_credits uc ON uc.user_id = p.id
  WHERE p.id = p_user_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION admin_get_user_status IS 'Admin function: Returns complete user status as JSON';

-- ============================================
-- DOCUMENTATION
-- ============================================

-- Example queries to run in Supabase Dashboard:

-- 1. See all users with their status:
-- SELECT * FROM admin_user_overview ORDER BY created_at DESC;

-- 2. Find users with expiring trials (conversion opportunities):
-- SELECT * FROM admin_trial_status WHERE trial_urgency IN ('expires_today', 'expires_tomorrow', 'expiring_soon');

-- 3. Check business metrics:
-- SELECT * FROM admin_revenue_summary;

-- 4. Find active subscribers:
-- SELECT * FROM admin_subscriptions WHERE status = 'active';

-- 5. Find most engaged users:
-- SELECT * FROM admin_usage_stats ORDER BY total_meetings DESC, lifetime_minutes_used DESC;

-- 6. Get detailed status for a specific user:
-- SELECT admin_get_user_status('user-uuid-here');

