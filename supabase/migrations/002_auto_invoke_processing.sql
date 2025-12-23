-- Migration: Auto-invoke Edge Function when meeting is queued
-- This trigger will automatically call the process-recording Edge Function
-- when a meeting status changes to 'queued'

-- ============================================
-- FUNCTION: Invoke Edge Function via HTTP
-- ============================================

CREATE OR REPLACE FUNCTION invoke_process_recording()
RETURNS TRIGGER AS $$
DECLARE
  function_url TEXT;
  supabase_anon_key TEXT;
  request_id BIGINT;
BEGIN
  -- Only trigger when status changes to 'queued'
  IF NEW.status = 'queued' AND (OLD IS NULL OR OLD.status != 'queued') THEN
    -- Get the Supabase URL and construct the function URL
    function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/process-recording';
    supabase_anon_key := current_setting('app.settings.supabase_anon_key', true);
    
    -- Use pg_net to make async HTTP request
    -- This won't block the transaction
    SELECT net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', supabase_anon_key
      ),
      body := jsonb_build_object(
        'meeting_id', NEW.id::text
      )
    ) INTO request_id;
    
    RAISE LOG 'Triggered process-recording for meeting % with request_id %', NEW.id, request_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGER: Auto-invoke processing on queue
-- ============================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS meeting_queued_invoke_function ON meetings;

CREATE TRIGGER meeting_queued_invoke_function
  AFTER INSERT OR UPDATE ON meetings
  FOR EACH ROW
  WHEN (NEW.status = 'queued')
  EXECUTE FUNCTION invoke_process_recording();

-- ============================================
-- NOTES FOR MANUAL SETUP
-- ============================================

-- You need to set these configuration values in your Supabase project:
-- 1. Go to Supabase Dashboard > Project Settings > API
-- 2. Run these SQL commands in the SQL Editor:
--
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://jaepslscnnjtowwkiudu.supabase.co';
-- ALTER DATABASE postgres SET app.settings.supabase_anon_key = 'your-anon-key-here';
--
-- Replace with your actual values from the API settings page.

