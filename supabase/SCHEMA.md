# Legal Memo - Supabase Schema Reference

This document describes the current database schema, Edge Functions, and configuration for the Legal Memo backend.

## Business Model

- **7-day free trial**: New users get unlimited access for 7 days from signup
- **$97/month subscription**: After trial expires, users need a Polar subscription for continued access
- **Payment provider**: Polar (web checkout)

---

## Database Tables

### Core Tables

#### `profiles`
Extends `auth.users` with app-specific user data.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (references auth.users) |
| email | text | User's email address |
| display_name | text | User's display name |
| onboarding_completed | boolean | Whether user completed onboarding |
| hourly_rate | numeric | Default hourly rate for billing |
| currency_symbol | text | Preferred currency symbol (default: $) |
| polar_customer_id | text | Polar customer ID for payments |
| trial_started_at | timestamptz | When the 7-day free trial started |
| created_at | timestamptz | Account creation timestamp |
| updated_at | timestamptz | Last update timestamp |

#### `meetings`
Stores meeting recordings and metadata.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner's user ID |
| title | text | Meeting title |
| status | text | Processing status: uploading, queued, converting, transcribing, ready, failed |
| raw_audio_path | text | Path to original audio in storage |
| mp3_audio_path | text | Path to converted MP3 |
| raw_audio_format | text | Original audio format (webm, m4a, etc.) |
| duration_seconds | integer | Recording duration |
| recorded_at | timestamptz | When recording started |
| expected_speakers | integer | Number of expected speakers (1=solo, 2=default, 3+=group) |
| meeting_type_id | uuid | Reference to meeting_types |
| contact_id | uuid | Reference to contacts |
| is_billable | boolean | Whether meeting is billable |
| billable_hours | numeric | Hours to bill |
| billable_amount | numeric | Total billing amount |
| billable_amount_manual | boolean | If amount was manually set |
| live_transcript_data | jsonb | Raw streaming transcription data |
| used_streaming_transcription | boolean | If real-time transcription was used |
| error_message | text | Error message if processing failed |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

#### `transcripts`
Stores meeting transcription results.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| meeting_id | uuid | Reference to meetings (unique) |
| full_text | text | Complete transcript text |
| summary | text | AI-generated summary |
| assemblyai_transcript_id | text | AssemblyAI transcript ID |
| created_at | timestamptz | Creation timestamp |

#### `transcript_segments`
Speaker-diarized transcript segments.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| meeting_id | uuid | Reference to meetings |
| speaker | text | Speaker label (Speaker A, Speaker B, etc.) |
| text | text | Segment text |
| start_ms | integer | Start time in milliseconds |
| end_ms | integer | End time in milliseconds |
| confidence | numeric | Transcription confidence score |
| is_streaming_result | boolean | If from real-time streaming |
| streaming_session_id | text | AssemblyAI session ID |
| created_at | timestamptz | Creation timestamp |

### Processing Tables

#### `processing_jobs`
Tracks audio processing pipeline jobs.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| meeting_id | uuid | Reference to meetings |
| status | text | Job status: pending, processing, completed, failed |
| step | text | Current step: converting, transcribing |
| attempts | integer | Number of processing attempts |
| error | text | Error message if failed |
| started_at | timestamptz | When processing started |
| completed_at | timestamptz | When processing completed |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

#### `streaming_sessions`
Tracks real-time streaming transcription sessions.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| meeting_id | uuid | Reference to meetings |
| assemblyai_session_id | text | AssemblyAI session ID |
| expires_at | timestamptz | Session expiration |
| started_at | timestamptz | When session started |
| ended_at | timestamptz | When session ended |
| last_activity_at | timestamptz | Last activity timestamp |
| chunks_processed | integer | Number of audio chunks processed |
| status | text | Session status: active, completed, failed, expired |
| error_message | text | Error message if failed |
| created_at | timestamptz | Creation timestamp |

### Organization Tables

#### `meeting_types`
User-defined meeting type categories.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner's user ID |
| name | text | Type name |
| color | text | Display color (hex) |
| is_default | boolean | If this is the default type |
| display_order | integer | Sort order |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

#### `contacts`
Contact/client management.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner's user ID |
| category_id | uuid | Reference to contact_categories |
| first_name | text | Contact's first name |
| last_name | text | Contact's last name |
| company | text | Company name |
| email | text | Email address |
| phone | text | Phone number |
| notes | text | Notes about contact |
| external_id | text | External CRM ID |
| external_source | text | CRM source: clio, practicepanther |
| last_synced_at | timestamptz | Last CRM sync |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

#### `contact_categories`
Contact categorization (Client, Opposing Counsel, etc.).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner's user ID |
| name | text | Category name |
| color | text | Display color (hex) |
| is_default | boolean | If this is the default category |
| display_order | integer | Sort order |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

### Sharing Tables

#### `meeting_shares`
Public sharing links for meetings.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| meeting_id | uuid | Reference to meetings |
| share_token | text | Unique share token (unique) |
| password_hash | text | Hashed password (if protected) |
| is_active | boolean | If share is active |
| view_count | integer | Number of views |
| last_viewed_at | timestamptz | Last view timestamp |
| expires_at | timestamptz | Expiration date |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

### Subscription & Usage Tables

#### `subscriptions`
Polar subscription tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Reference to auth.users (unique) |
| polar_subscription_id | text | Polar subscription ID |
| polar_customer_id | text | Polar customer ID |
| status | text | Status: active, canceled, expired, billing_issue, trialing, past_due, incomplete |
| plan_name | text | Plan name |
| monthly_minutes_included | integer | Minutes included (999999 = unlimited) |
| overage_rate_cents | integer | Overage rate in cents |
| current_period_start | timestamptz | Billing period start |
| current_period_end | timestamptz | Billing period end |
| canceled_at | timestamptz | When subscription was canceled |
| store | text | Payment store (polar) |
| environment | text | Environment (production, sandbox) |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

#### `usage_credits`
Usage tracking per billing period (for analytics).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Reference to auth.users (unique) |
| minutes_used_this_period | integer | Minutes used this billing period |
| period_start | timestamptz | Period start date |
| period_end | timestamptz | Period end date |
| lifetime_minutes_used | integer | Total minutes used all time |
| last_usage_at | timestamptz | Last usage timestamp |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

#### `usage_transactions`
Audit log of all usage events.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Reference to auth.users |
| meeting_id | uuid | Reference to meetings |
| minutes | integer | Minutes used |
| transaction_type | text | Type: recording, free_trial, subscription_reset, adjustment |
| description | text | Transaction description |
| polar_event_id | text | Polar webhook event ID |
| created_at | timestamptz | Creation timestamp |

---

## Database Functions

### `can_user_record(p_user_id UUID)`
Checks if user can record a new meeting.

Returns JSON with:
- `can_record`: boolean
- `has_active_trial`: boolean
- `trial_started_at`: timestamp
- `trial_expires_at`: timestamp
- `trial_days_remaining`: integer
- `has_subscription`: boolean
- `subscription_status`: text
- `reason`: 'active_subscription' | 'active_trial' | 'trial_expired'

### `can_access_features(p_user_id UUID)`
Checks if user can access premium features (meeting details, playback, etc.).

Returns same structure as `can_user_record`.

### `record_usage(p_user_id, p_meeting_id, p_minutes, p_is_free_trial, p_polar_event_id)`
Records usage minutes for analytics and audit trail.

### `reset_usage_period(p_user_id, p_period_start, p_period_end)`
Resets usage counter for new billing period.

### `increment_share_view_count(p_share_token)`
Increments view count for shared meetings.

---

## Admin Views

The following views are available for admin dashboards (query via Supabase Dashboard or service role):

- `admin_user_overview` - Complete user overview with subscription and trial status
- `admin_subscriptions` - Detailed subscription information
- `admin_usage_stats` - Usage analytics per user
- `admin_trial_status` - Trial tracking with conversion opportunities
- `admin_revenue_summary` - Aggregate business metrics

---

## Edge Functions

### `get-assemblyai-token`
Returns AssemblyAI API key for authenticated users to enable real-time streaming transcription.

**Auth**: Required (Bearer token)  
**Method**: POST  
**Returns**: `{ token, expires_at, websocket_url, sample_rate, user_id }`

### `process-recording`
Processes recorded audio through the full pipeline:
1. Download raw audio from storage
2. Convert to MP3 using CloudConvert
3. Transcribe with AssemblyAI (with speaker diarization)
4. Generate summary with LeMUR
5. Save transcript and segments to database
6. Record usage for analytics

**Auth**: Service role (triggered by database)  
**Method**: POST  
**Body**: `{ meeting_id: string }`

### `streaming-transcribe`
Handles real-time streaming transcription with AssemblyAI v3 API.

**Auth**: Required (Bearer token)  
**Method**: POST  
**Actions**:
- `start-session` - Initialize streaming session
- `process-chunk` - Process audio chunk
- `end-session` - Terminate session

### `polar-checkout`
Creates Polar checkout session and redirects to hosted checkout page.

**Auth**: None (browser redirect)  
**Method**: GET  
**Query params**: `products`, `customerEmail`, `customerExternalId`, `metadata`

### `polar-webhook`
Handles Polar webhook events for subscription management.

**Auth**: Webhook signature verification  
**Method**: POST  
**Events handled**:
- `subscription.created`
- `subscription.active`
- `subscription.updated`
- `subscription.canceled`
- `subscription.revoked`
- `subscription.uncanceled`
- `customer.created`

### `polar-customer-portal`
Redirects users to their Polar subscription management portal.

**Auth**: None (browser redirect)  
**Method**: GET  
**Query params**: `customerId`

### `shared-meeting`
Returns meeting data as JSON for public sharing pages.

**Auth**: None (token-based)  
**Method**: GET/POST  
**Query params**: `token`, `mode`

---

## Environment Variables

### Required for Edge Functions

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `ASSEMBLYAI_API_KEY` | AssemblyAI API key for transcription |
| `CLOUDCONVERT_API_KEY` | CloudConvert API key for audio conversion |
| `POLAR_ACCESS_TOKEN` | Polar API access token (production) |
| `POLAR_WEBHOOK_SECRET` | Polar webhook secret (production) |

### Polar Sandbox Testing (Optional)

| Variable | Description |
|----------|-------------|
| `POLAR_MODE` | Set to `"sandbox"` for testing, `"production"` (default) for live |
| `POLAR_SANDBOX_ACCESS_TOKEN` | Polar sandbox API token (from sandbox.polar.sh) |
| `POLAR_SANDBOX_WEBHOOK_SECRET` | Polar sandbox webhook secret |

When `POLAR_MODE=sandbox`, all Polar Edge Functions will use sandbox credentials and API endpoints. Subscriptions created in sandbox mode are tracked with `environment: "sandbox"` in the database.

### Client-side (Expo)

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `EXPO_PUBLIC_POLAR_CHECKOUT_URL` | Polar checkout Edge Function URL |
| `EXPO_PUBLIC_POLAR_PRODUCT_PRICE_ID` | Production Polar product price ID |
| `EXPO_PUBLIC_POLAR_SANDBOX_PRODUCT_PRICE_ID` | Sandbox Polar product price ID (for testing) |
| `EXPO_PUBLIC_POLAR_MODE` | Set to `"sandbox"` for testing, `"production"` (default) for live |

---

## Storage Buckets

### `meeting-audio`
Stores all meeting audio files.

- **Public**: No
- **File size limit**: 500MB
- **Allowed MIME types**: audio/mp4, audio/m4a, audio/webm, audio/mpeg, audio/mp3
- **Folder structure**: `{user_id}/{meeting_id}.{format}`

---

## Row Level Security (RLS)

All tables have RLS enabled. Users can only access their own data:
- Profiles: Users can view/update their own profile
- Meetings: Users can CRUD their own meetings
- Transcripts: Access via meeting ownership
- Contacts: Users can CRUD their own contacts
- Subscriptions: Users can view their own subscription

Service role bypasses RLS for admin operations and Edge Functions.

