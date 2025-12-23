# Legal Meeting Assistant - Setup Guide

## Overview

This app records meetings and processes them through:
- **CloudConvert** - Converts WebM/M4A audio to MP3 for universal playback
- **AssemblyAI** - Transcription with speaker diarization + LeMUR summarization

## Prerequisites

1. **AssemblyAI Account** - Sign up at [assemblyai.com](https://www.assemblyai.com/)
2. **CloudConvert Account** - Sign up at [cloudconvert.com](https://cloudconvert.com/)
3. **Supabase Project** - Already configured
4. **Expo CLI** - For running the mobile app

## Environment Variables

### 1. App Environment Variables

Create a `.env` file in the project root:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://jaepslscnnjtowwkiudu.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 2. Supabase Edge Function Secrets

Set these in Supabase Dashboard → Settings → Edge Functions → Secrets:

```bash
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
CLOUDCONVERT_API_KEY=your_cloudconvert_api_key
```

## Running the App

```bash
# Install dependencies
bun install

# Start the development server
bun start

# Or with specific platforms
bun run ios
bun run android
npx expo start --web
```

## Architecture

### Processing Flow

```
1. User taps "Record" → Meeting created with status "uploading"
2. User stops recording → Audio uploaded to Supabase Storage
3. Meeting status set to "queued" → Processing job created automatically
4. Client invokes Edge Function `process-recording`
5. Edge Function:
   a. Downloads raw audio from Storage
   b. Converts to MP3 via CloudConvert
   c. Uploads MP3 back to Storage
   d. Transcribes with AssemblyAI (speaker diarization enabled)
   e. Generates summary with LeMUR
   f. Saves transcript + segments to database
6. Meeting status set to "ready"
7. User redirected to meeting detail view
```

### Database Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (extends auth.users) |
| `meetings` | Meeting records with status tracking |
| `transcripts` | Full text + summary per meeting |
| `transcript_segments` | Speaker-labeled segments with timestamps |
| `processing_jobs` | Job tracking for background processing |

### Meeting Statuses

| Status | Description |
|--------|-------------|
| `uploading` | Recording in progress or uploading |
| `queued` | Waiting for processing |
| `converting` | Converting audio to MP3 |
| `transcribing` | AssemblyAI transcription in progress |
| `ready` | Processing complete |
| `failed` | Processing failed (see error_message) |

## Storage

The app uses a Supabase Storage bucket called `meeting-audio`:
- Path format: `{user_id}/{meeting_id}/audio.{ext}`
- Original upload: `audio.webm` (web) or `audio.m4a` (native)
- Converted file: `audio.mp3`

## Edge Functions

| Function | Purpose | Status |
|----------|---------|--------|
| `process-recording` | Unified pipeline: CloudConvert + AssemblyAI | **Active** |
| `process-meeting` | Old function (deprecated) | Legacy |
| `transcode-audio` | Old function (deprecated) | Legacy |

## Costs

| Service | Rate | ~10 min meeting |
|---------|------|-----------------|
| CloudConvert | ~$0.01/min | ~$0.10 |
| AssemblyAI Transcription | $0.00025/sec | ~$0.15 |
| LeMUR (summary) | $0.002/1K chars in, $0.01/1K chars out | ~$0.06 |
| **Total** | | **~$0.31** |

## Troubleshooting

### Processing Fails

1. Check Supabase Edge Function logs (Dashboard → Edge Functions → Logs)
2. Verify both `ASSEMBLYAI_API_KEY` and `CLOUDCONVERT_API_KEY` are set
3. Ensure the `meeting-audio` storage bucket exists
4. Check the `processing_jobs` table for error details

### Audio Doesn't Play

- Ensure the meeting status is "ready"
- Check that `mp3_audio_path` is populated in the meetings table
- Verify storage policies allow the user to access their files

### No Speaker Labels

AssemblyAI requires at least 2 speakers for diarization. Single-speaker recordings will show as "Speaker A".

### Processing Takes Too Long

- Normal processing time: 2-5 minutes for 10 min audio
- CloudConvert conversion: 30 seconds - 2 minutes
- AssemblyAI transcription: 1-3 minutes
- Maximum wait time: 15 minutes before timeout

## Support

For issues:
1. Check Edge Function logs in Supabase Dashboard
2. Review the `processing_jobs` table for error messages
3. Check CloudConvert dashboard for conversion status
4. Check AssemblyAI dashboard for transcription status
