# Processing Diagnostics & Troubleshooting

## Issue: Meetings Stuck in "Queued" Status

### Root Causes Identified

1. **Edge Function JWT Verification** ✅ FIXED
   - **Problem**: The `process-recording` Edge Function had `verify_jwt: true` enabled
   - **Impact**: Client calls were returning 401 Unauthorized
   - **Solution**: Redeployed function with `verify_jwt: false`
   - **Status**: Deployed as version 2

2. **Missing API Keys** ⚠️ NEEDS VERIFICATION
   - **Required**: `CLOUDCONVERT_API_KEY` and `ASSEMBLYAI_API_KEY`
   - **Location**: Supabase Dashboard > Project Settings > Edge Functions > Secrets
   - **Action Required**: Verify these are configured

3. **Client-Side Error Handling** ✅ FIXED
   - **Problem**: Errors during Edge Function invocation weren't properly handled
   - **Impact**: Meetings stayed in "queued" even if function call failed
   - **Solution**: Updated `MeetingContext.tsx` to throw errors and update meeting status

### Current Architecture

```
User Records Audio
    ↓
Upload to Storage
    ↓
Update Meeting (status: 'queued')
    ↓
Trigger Edge Function (client-side)
    ↓
Edge Function Processes:
  1. Download audio from storage
  2. Convert to MP3 (CloudConvert)
  3. Transcribe (AssemblyAI)
  4. Generate summary (LeMUR)
  5. Save to database
    ↓
Update Meeting (status: 'ready')
```

### How to Verify API Keys

1. Go to Supabase Dashboard
2. Navigate to: Project Settings > Edge Functions > Secrets
3. Verify these secrets exist:
   - `CLOUDCONVERT_API_KEY`
   - `ASSEMBLYAI_API_KEY`

If missing, add them:
- CloudConvert: Get from https://cloudconvert.com/dashboard/api/v2/keys
- AssemblyAI: Get from https://www.assemblyai.com/app/account

### How to Manually Trigger Processing

If a meeting is stuck in "queued", you can manually trigger it:

#### Option 1: Using Supabase SQL Editor

```sql
-- Get the stuck meeting ID
SELECT id, status, raw_audio_path, created_at
FROM meetings
WHERE status = 'queued'
ORDER BY created_at DESC;

-- Then use the Supabase Functions API to trigger processing
-- (This must be done via HTTP client or the app's retry button)
```

#### Option 2: Using the App's Retry Button

1. Navigate to the processing screen
2. If it fails, a "Retry Processing" button will appear
3. Click the button to manually trigger the Edge Function

#### Option 3: Using curl (for testing)

```bash
# Replace with your project details
PROJECT_URL="https://jaepslscnnjtowwkiudu.supabase.co"
ANON_KEY="your-anon-key"
MEETING_ID="ae814e63-379e-498a-9a5f-0444540e42d9"

curl -X POST "$PROJECT_URL/functions/v1/process-recording" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d "{\"meeting_id\": \"$MEETING_ID\"}"
```

### Monitoring Processing

#### Check Edge Function Logs

```sql
-- View recent Edge Function calls (via Supabase Dashboard)
-- Dashboard > Edge Functions > process-recording > Logs
```

#### Check Processing Job Status

```sql
SELECT 
  m.id,
  m.status as meeting_status,
  m.error_message,
  pj.status as job_status,
  pj.step,
  pj.error as job_error,
  pj.started_at,
  pj.completed_at
FROM meetings m
LEFT JOIN processing_jobs pj ON pj.meeting_id = m.id
WHERE m.status IN ('queued', 'converting', 'transcribing', 'failed')
ORDER BY m.created_at DESC;
```

### Common Errors and Solutions

#### Error: "CLOUDCONVERT_API_KEY not configured"
**Solution**: Add the CloudConvert API key to Edge Function secrets

#### Error: "ASSEMBLYAI_API_KEY not configured"
**Solution**: Add the AssemblyAI API key to Edge Function secrets

#### Error: "Failed to download audio"
**Solution**: Check storage bucket permissions and file path

#### Error: "CloudConvert conversion failed"
**Solution**: 
- Verify CloudConvert API key is valid
- Check CloudConvert account has credits
- Verify audio format is supported

#### Error: "AssemblyAI transcription failed"
**Solution**:
- Verify AssemblyAI API key is valid
- Check AssemblyAI account has credits
- Ensure audio file is accessible via signed URL

### Testing the Fix

1. **Record a new meeting** in the app
2. **Watch the processing screen** - it should progress through:
   - Queued
   - Converting Audio
   - Transcribing
   - Ready (redirects to meeting)
3. **Check logs** if it fails:
   - Supabase Dashboard > Edge Functions > process-recording > Logs
   - Look for error messages

### For the Current Stuck Meeting

The meeting `ae814e63-379e-498a-9a5f-0444540e42d9` is currently stuck in "queued" status.

**To fix it:**
1. Verify API keys are configured (see above)
2. Use the app to navigate to the processing screen
3. Wait for it to detect failure (or refresh the app)
4. Click "Retry Processing" button

**Or manually trigger via SQL:**

```sql
-- This will be picked up by the app's polling mechanism
UPDATE meetings 
SET status = 'failed', 
    error_message = 'Manually reset - please retry'
WHERE id = 'ae814e63-379e-498a-9a5f-0444540e42d9';
```

Then use the retry button in the app.

### Changes Made

1. ✅ Deployed `process-recording` Edge Function with `verify_jwt: false`
2. ✅ Updated `MeetingContext.tsx` to properly handle Edge Function errors
3. ✅ Added comprehensive error messages and status updates
4. ✅ Created this diagnostic document

### Next Steps

1. **Verify API Keys** - Check Supabase Dashboard
2. **Test with New Recording** - Record a short meeting to test the flow
3. **Monitor Logs** - Watch Edge Function logs during processing
4. **Fix Stuck Meeting** - Use retry button or manual SQL update

