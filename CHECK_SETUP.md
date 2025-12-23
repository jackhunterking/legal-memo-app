# Quick Setup Check

## ✅ Checklist for Processing to Work

### 1. Edge Function Secrets (CRITICAL)
Go to: **Supabase Dashboard > Project Settings > Edge Functions > Secrets**

Required secrets:
- [ ] `CLOUDCONVERT_API_KEY` - Get from https://cloudconvert.com/dashboard/api/v2/keys
- [ ] `ASSEMBLYAI_API_KEY` - Get from https://www.assemblyai.com/app/account

### 2. Storage Bucket
Go to: **Supabase Dashboard > Storage**

Required bucket:
- [ ] `meeting-audio` bucket exists
- [ ] Bucket is private (not public)
- [ ] RLS policies are set up (should be automatic from migration)

### 3. Edge Function Status
Go to: **Supabase Dashboard > Edge Functions**

Required function:
- [ ] `process-recording` is deployed
- [ ] Status: ACTIVE
- [ ] Version: 2 or higher
- [ ] verify_jwt: false

### 4. Test the App

#### Quick Test:
1. Open the app on your device/simulator
2. Navigate to the stuck meeting (if visible)
3. You should see "Retry Processing" button
4. Tap it and watch the progress

#### Full Test:
1. Record a new 10-second test meeting
2. Upload it
3. Watch the processing screen progress through:
   - Queued (1-2 sec)
   - Converting Audio (30-60 sec)
   - Transcribing (1-2 min)
   - Ready (auto-redirect)

## 🔍 Quick Diagnostics

### Check Current Meetings Status
Run this in Supabase SQL Editor:

```sql
SELECT 
  id,
  title,
  status,
  error_message,
  created_at,
  raw_audio_path IS NOT NULL as has_audio
FROM meetings
ORDER BY created_at DESC
LIMIT 5;
```

### Check Edge Function Logs
1. Go to: **Supabase Dashboard > Edge Functions > process-recording**
2. Click "Logs" tab
3. Look for recent invocations
4. Check for errors (should see 200 status codes, not 401)

### Check Processing Jobs
```sql
SELECT 
  meeting_id,
  status,
  step,
  error,
  started_at,
  completed_at
FROM processing_jobs
ORDER BY created_at DESC
LIMIT 5;
```

## 🚨 Common Issues

### Issue: "CLOUDCONVERT_API_KEY not configured"
**Solution**: Add the CloudConvert API key to Edge Function secrets

### Issue: "ASSEMBLYAI_API_KEY not configured"
**Solution**: Add the AssemblyAI API key to Edge Function secrets

### Issue: Still getting 401 errors
**Solution**: 
1. Check Edge Function version is 2 or higher
2. Verify `verify_jwt` is false
3. Redeploy if needed

### Issue: Meeting stuck in "Converting"
**Solution**:
- Check CloudConvert account has credits
- Check CloudConvert API key is valid
- View Edge Function logs for detailed error

### Issue: Meeting stuck in "Transcribing"
**Solution**:
- Check AssemblyAI account has credits
- Check AssemblyAI API key is valid
- View Edge Function logs for detailed error

## 📱 What the User Sees

### Normal Flow:
```
Recording Screen
    ↓
[Tap Stop & Save]
    ↓
Processing Screen (auto-navigate)
    ↓
"Queued..." (2 sec)
    ↓
"Converting Audio..." (30-60 sec)
    ↓
"Transcribing..." (1-3 min)
    ↓
Meeting Details Screen (auto-navigate)
```

### Error Flow:
```
Processing Screen
    ↓
"Processing Failed"
    ↓
[Shows error message]
    ↓
[Retry Processing] button
    ↓
[View Meeting Anyway] button
```

## 🎯 Success Indicators

✅ Edge Function logs show 200 status codes
✅ Meetings progress from queued → converting → transcribing → ready
✅ Transcript appears in meeting details
✅ Audio playback works
✅ Speaker segments are visible

## 📞 Need Help?

1. Check `PROCESSING_DIAGNOSTICS.md` for detailed troubleshooting
2. Check `PROCESSING_FIX_SUMMARY.md` for what was fixed
3. Review Edge Function logs in Supabase Dashboard
4. Check SQL queries above to inspect database state

---

**Quick Start**: Just verify the API keys are set, then test with a new recording!

