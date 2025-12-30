-- ============================================
-- FIX: Add explicit public schema prefix to trigger functions
-- This fixes the "relation does not exist" error during signup
-- The supabase_auth_admin role has search_path=auth, so functions
-- must explicitly reference public.* tables
-- ============================================

-- Fix create_default_contact_categories
CREATE OR REPLACE FUNCTION public.create_default_contact_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.contact_categories (user_id, name, color, is_default, display_order)
  VALUES 
    (NEW.id, 'Client', '#3B82F6', true, 1),
    (NEW.id, 'Opposing Counsel', '#EF4444', true, 2),
    (NEW.id, 'Witness', '#8B5CF6', true, 3),
    (NEW.id, 'Expert', '#F59E0B', true, 4),
    (NEW.id, 'Co-Counsel', '#10B981', true, 5)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Fix create_default_meeting_types (trigger version)
CREATE OR REPLACE FUNCTION public.create_default_meeting_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.meeting_types (user_id, name, color, is_default, display_order)
  VALUES 
    (NEW.id, 'Consultation', '#3B82F6', true, 1),
    (NEW.id, 'Review', '#8B5CF6', true, 2),
    (NEW.id, 'Negotiation', '#F59E0B', true, 3)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Fix create_default_meeting_types (standalone version with UUID parameter)
CREATE OR REPLACE FUNCTION public.create_default_meeting_types(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.meeting_types (user_id, name, color, is_default, display_order)
  VALUES
    (target_user_id, 'General Legal Meeting', '#3B82F6', true, 1),
    (target_user_id, 'Client Consultation', '#10B981', true, 2),
    (target_user_id, 'Case Review', '#8B5CF6', true, 3),
    (target_user_id, 'Settlement Discussion', '#F59E0B', true, 4),
    (target_user_id, 'Contract Negotiation', '#06B6D4', true, 5),
    (target_user_id, 'Witness Interview', '#EC4899', true, 6),
    (target_user_id, 'Internal Meeting', '#6B7280', true, 7)
  ON CONFLICT (user_id, LOWER(name)) DO NOTHING;
END;
$function$;

-- Fix create_usage_credits_for_user
CREATE OR REPLACE FUNCTION public.create_usage_credits_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.usage_credits (user_id, minutes_used_this_period, lifetime_minutes_used)
  VALUES (NEW.id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Add comment explaining why public. prefix is required
COMMENT ON FUNCTION public.create_default_contact_categories IS 'Creates default contact categories for new users. Must use public.* prefix because supabase_auth_admin has search_path=auth';
COMMENT ON FUNCTION public.create_default_meeting_types() IS 'Creates default meeting types for new users. Must use public.* prefix because supabase_auth_admin has search_path=auth';
COMMENT ON FUNCTION public.create_usage_credits_for_user IS 'Creates usage credits record for new users. Must use public.* prefix because supabase_auth_admin has search_path=auth';

