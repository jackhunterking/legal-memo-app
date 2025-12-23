# Legal Meeting Assistant - Setup Guide

## Overview

This app uses **AssemblyAI** for all AI operations:
- Speech-to-text transcription with speaker diarization
- LeMUR LLM gateway for summaries, action items, and legal analysis

## Prerequisites

1. **AssemblyAI Account** - Sign up at [assemblyai.com](https://www.assemblyai.com/)
2. **Supabase Project** - Already configured
3. **Expo CLI** - For running the mobile app

## Environment Variables

### Supabase Edge Function Secrets

Set these in Supabase Dashboard → Settings → Edge Functions → Secrets:

```bash
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
```

Optional (for WebM to M4A transcoding on iOS):
```bash
CLOUDCONVERT_API_KEY=your_cloudconvert_api_key
```

### App Environment Variables

Create a `.env` file in the project root:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
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
bun run start:web
```

## Architecture

### Processing Flow

```
1. User records audio → Uploads to Supabase Storage
2. Meeting status set to "processing"
3. Edge Function `process-meeting` is triggered
4. AssemblyAI transcribes audio with speaker diarization
5. LeMUR generates summary, action items, and legal analysis
6. Results saved to database
7. Meeting status set to "ready"
```

### Database Tables

- `meetings` - Meeting records
- `transcript_segments` - Transcribed text with speaker labels
- `ai_outputs` - AI-generated summaries and analysis
- `meeting_tasks` - Extracted action items
- `ai_config` - Configurable AI settings
- `prompt_templates` - Customizable prompts for LeMUR

## Configuration

### AI Settings

Modify AI behavior via the `ai_config` table:

```sql
-- Example: Change the LLM model
UPDATE ai_config 
SET value = jsonb_set(value, '{lemur,analysis_model}', '"openai/gpt-4o"')
WHERE key = 'assemblyai';
```

### Prompt Templates

Customize prompts via the `prompt_templates` table:

```sql
-- Example: Update the legal analysis prompt
UPDATE prompt_templates 
SET prompt = 'Your new prompt here...'
WHERE name = 'legal_analysis';
```

## Edge Functions

| Function | Purpose |
|----------|---------|
| `process-meeting` | Main AI pipeline - transcription + analysis |
| `transcode-audio` | Convert WebM to M4A for iOS compatibility |
| `migrate-webm-recordings` | Batch migration utility |

## Costs

| Service | Rate | ~10 min meeting |
|---------|------|-----------------|
| AssemblyAI Transcription | $0.00025/sec | ~$0.15 |
| LeMUR (input) | $0.002/1K chars | ~$0.04 |
| LeMUR (output) | $0.01/1K chars | ~$0.02 |
| **Total** | | **~$0.21** |

## Troubleshooting

### Processing Fails

1. Check Supabase Edge Function logs
2. Verify `ASSEMBLYAI_API_KEY` is set
3. Ensure audio file was uploaded successfully

### No Speaker Labels

AssemblyAI requires at least 2 speakers to enable diarization. Single-speaker recordings will show as "Speaker A".

### Transcription Takes Too Long

- Normal processing time: 1-3 minutes for 10 min audio
- The Edge Function polls AssemblyAI every 5 seconds
- Maximum wait time: 10 minutes before timeout

## Support

For issues:
1. Check Supabase Dashboard → Edge Functions → Logs
2. Check AssemblyAI Dashboard for transcription status
3. Review the `meeting_jobs` table for error messages

