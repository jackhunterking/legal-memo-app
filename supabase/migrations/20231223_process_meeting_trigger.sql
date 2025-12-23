-- Enable pg_net extension for HTTP calls from database (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a function to invoke the process-meeting Edge Function
-- This will be called by a trigger when meeting status changes to 'processing'
CREATE OR REPLACE FUNCTION invoke_process_meeting()
RETURNS TRIGGER AS $$
DECLARE
  service_role_key TEXT;
  supabase_url TEXT;
  request_id BIGINT;
BEGIN
  -- Only trigger when status changes TO 'processing'
  IF NEW.status = 'processing' AND (OLD.status IS NULL OR OLD.status != 'processing') THEN
    
    -- Get the Supabase URL from environment (will be set via Vault)
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_role_key := current_setting('app.settings.service_role_key', true);
    
    -- If settings are not configured, log and skip
    IF supabase_url IS NULL OR service_role_key IS NULL THEN
      RAISE LOG 'process-meeting trigger: Supabase settings not configured, skipping auto-invoke';
      RETURN NEW;
    END IF;
    
    -- Make async HTTP POST to the Edge Function
    SELECT net.http_post(
      url := supabase_url || '/functions/v1/process-meeting',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := jsonb_build_object('meeting_id', NEW.id)
    ) INTO request_id;
    
    RAISE LOG 'process-meeting trigger: Invoked for meeting %, request_id: %', NEW.id, request_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on meetings table
DROP TRIGGER IF EXISTS trigger_process_meeting ON meetings;
CREATE TRIGGER trigger_process_meeting
  AFTER INSERT OR UPDATE OF status ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION invoke_process_meeting();

-- Note: The trigger will only work if you configure these settings in Supabase:
-- 1. Go to Database > Extensions and enable pg_net
-- 2. Go to Settings > Vault and add secrets:
--    - app.settings.supabase_url = your project URL
--    - app.settings.service_role_key = your service role key
-- 
-- Alternatively, the client can call the Edge Function directly after updating status,
-- which is the more reliable approach until pg_net is properly configured.

