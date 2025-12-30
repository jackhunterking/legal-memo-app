/**
 * Types for Legal Memo
 * 
 * Includes types for:
 * - Meeting management
 * - Transcript handling
 * - Streaming transcription sessions
 * - Audio chunk processing
 */

import * as Crypto from 'expo-crypto';

// =============================================================================
// Status Types
// =============================================================================

/** Meeting processing status */
export type MeetingStatus = 'uploading' | 'queued' | 'converting' | 'transcribing' | 'ready' | 'failed';

/** Processing job status */
export type ProcessingJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** Processing step indicator */
export type ProcessingStep = 'converting' | 'transcribing' | null;

/** Streaming session status */
export type StreamingSessionStatus = 'active' | 'completed' | 'failed' | 'expired';

// Profile
export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  onboarding_completed: boolean;
  // Billing settings
  hourly_rate: number | null;
  currency_symbol: string;
  // Payment integration (Polar)
  polar_customer_id: string | null;
  // Time-based trial (7 days from signup)
  trial_started_at: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Subscription & Usage Types
// =============================================================================

/** Subscription status */
export type SubscriptionStatus = 'active' | 'canceled' | 'expired' | 'billing_issue' | 'trialing' | 'past_due' | 'incomplete';

// =============================================================================
// Subscription Status Helpers (Single Source of Truth)
// =============================================================================

/**
 * Subscription statuses that grant full access.
 * - 'active': Paid subscription in good standing
 * - 'trialing': Polar free trial period (7 days with payment method)
 */
export const ACTIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'active',
  'trialing',
] as const;

/**
 * Check if a subscription status grants full access.
 * Use this function everywhere subscription access is checked.
 */
export function isSubscriptionActive(status: SubscriptionStatus | null | undefined): boolean {
  if (!status) return false;
  return (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

/**
 * Subscription statuses indicating billing problems (user should be warned).
 */
export const BILLING_ISSUE_STATUSES: readonly SubscriptionStatus[] = [
  'billing_issue',
  'past_due',
  'incomplete',
] as const;

/**
 * Check if subscription has billing issues requiring attention.
 */
export function hasSubscriptionBillingIssue(status: SubscriptionStatus | null | undefined): boolean {
  if (!status) return false;
  return (BILLING_ISSUE_STATUSES as readonly string[]).includes(status);
}

/**
 * Subscription statuses indicating subscription has ended.
 */
export const INACTIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'canceled',
  'expired',
] as const;

// =============================================================================
// Cancellation Status Helpers
// =============================================================================

/**
 * Check if subscription is canceled (regardless of whether access remains).
 */
export function isCanceled(status: SubscriptionStatus | null | undefined): boolean {
  return status === 'canceled';
}

/**
 * Check if subscription is canceled but user still has access until period end.
 * This is the "grace period" where user can still use the app.
 * @param subscription - The subscription object
 * @returns true if canceled but period hasn't ended yet
 */
export function isCanceledButStillActive(subscription: Subscription | null | undefined): boolean {
  if (!subscription) return false;
  if (subscription.status !== 'canceled') return false;
  if (!subscription.current_period_end) return false;
  
  const periodEnd = new Date(subscription.current_period_end);
  return periodEnd > new Date();
}

/**
 * Get the date when access ends for a subscription.
 * For active subscriptions, this is the renewal date.
 * For canceled subscriptions, this is when access will be revoked.
 */
export function getAccessEndDate(subscription: Subscription | null | undefined): Date | null {
  if (!subscription?.current_period_end) return null;
  return new Date(subscription.current_period_end);
}

/**
 * Get days until access ends.
 * Returns 0 if subscription is null, expired, or no period end date.
 */
export function getDaysUntilAccessEnds(subscription: Subscription | null | undefined): number {
  const endDate = getAccessEndDate(subscription);
  if (!endDate) return 0;
  
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Information about cancellation status for display.
 */
export interface CancellationDisplayInfo {
  isCanceled: boolean;
  hasAccess: boolean;
  accessEndsAt: Date | null;
  daysRemaining: number;
  reason: CancellationReason | null;
  displayMessage: string;
  urgencyLevel: 'none' | 'info' | 'warning' | 'danger';
}

/**
 * Get comprehensive cancellation display information.
 * Use this for rendering cancellation status in the UI.
 */
export function getCancellationDisplayInfo(subscription: Subscription | null | undefined): CancellationDisplayInfo {
  const canceled = isCanceled(subscription?.status);
  const stillActive = isCanceledButStillActive(subscription);
  const accessEndsAt = getAccessEndDate(subscription);
  const daysRemaining = getDaysUntilAccessEnds(subscription);
  const reason = subscription?.cancellation_reason || null;

  // Not canceled
  if (!canceled) {
    return {
      isCanceled: false,
      hasAccess: isSubscriptionActive(subscription?.status),
      accessEndsAt,
      daysRemaining,
      reason: null,
      displayMessage: '',
      urgencyLevel: 'none',
    };
  }

  // Canceled but still has access
  if (stillActive) {
    let urgency: 'info' | 'warning' | 'danger' = 'info';
    let message = '';
    
    if (daysRemaining <= 1) {
      urgency = 'danger';
      message = daysRemaining === 0 
        ? 'Your access ends today' 
        : 'Your access ends tomorrow';
    } else if (daysRemaining <= 3) {
      urgency = 'warning';
      message = `Your access ends in ${daysRemaining} days`;
    } else {
      message = accessEndsAt 
        ? `Access until ${accessEndsAt.toLocaleDateString()}`
        : `Access ends in ${daysRemaining} days`;
    }

    return {
      isCanceled: true,
      hasAccess: true,
      accessEndsAt,
      daysRemaining,
      reason,
      displayMessage: message,
      urgencyLevel: urgency,
    };
  }

  // Canceled and access has ended
  return {
    isCanceled: true,
    hasAccess: false,
    accessEndsAt,
    daysRemaining: 0,
    reason,
    displayMessage: 'Your subscription has ended',
    urgencyLevel: 'danger',
  };
}

/**
 * Get user-friendly message for cancellation reason.
 */
export function getCancellationReasonMessage(reason: CancellationReason | null | undefined): string {
  switch (reason) {
    case 'user_requested':
      return 'You canceled your subscription';
    case 'payment_failed':
      return 'Payment could not be processed';
    case 'trial_ended':
      return 'Free trial period ended';
    case 'admin_revoked':
      return 'Subscription was revoked';
    default:
      return 'Subscription canceled';
  }
}

/** Payment store type (Polar only) */
export type PaymentStore = 'polar';

/** Subscription record */
export interface Subscription {
  id: string;
  user_id: string;
  // Polar fields
  polar_subscription_id: string | null;
  polar_customer_id: string | null;
  status: SubscriptionStatus;
  plan_name: string;
  monthly_minutes_included: number;
  overage_rate_cents: number;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  cancellation_reason: CancellationReason | null;
  store: PaymentStore | null;
  environment: string | null;
  created_at: string;
  updated_at: string;
}

/** Usage credits tracking */
export interface UsageCredits {
  id: string;
  user_id: string;
  minutes_used_this_period: number;
  period_start: string | null;
  period_end: string | null;
  lifetime_minutes_used: number;
  last_usage_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Usage transaction types */
export type UsageTransactionType = 'recording' | 'free_trial' | 'subscription_reset' | 'adjustment';

/** Usage transaction record */
export interface UsageTransaction {
  id: string;
  user_id: string;
  meeting_id: string | null;
  minutes: number;
  transaction_type: UsageTransactionType;
  description: string | null;
  // Polar event ID
  polar_event_id: string | null;
  created_at: string;
}

/** Result from can_user_record database function (time-based trial) */
export interface CanRecordResult {
  can_record: boolean;
  has_active_trial: boolean;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  trial_days_remaining: number;
  has_subscription: boolean;
  subscription_status: SubscriptionStatus | null;
  // Cancellation status fields
  is_canceling: boolean;
  canceled_but_active: boolean;
  canceled_at: string | null;
  cancellation_reason: CancellationReason | null;
  access_ends_at: string | null;
  days_until_access_ends: number;
  current_period_end: string | null;
  reason: 'active_subscription' | 'canceled_but_active' | 'active_trial' | 'trial_expired';
}

/** Result from can_access_features database function */
export interface CanAccessResult {
  can_access: boolean;
  has_active_trial: boolean;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  trial_days_remaining: number;
  has_subscription: boolean;
  subscription_status: SubscriptionStatus | null;
  // Cancellation status fields
  is_canceling: boolean;
  canceled_but_active: boolean;
  canceled_at: string | null;
  cancellation_reason: CancellationReason | null;
  access_ends_at: string | null;
  days_until_access_ends: number;
  current_period_end: string | null;
  reason: 'active_subscription' | 'canceled_but_active' | 'active_trial' | 'trial_expired';
}

/** User's current usage state */
export interface UsageState {
  // Subscription info
  hasActiveSubscription: boolean;
  subscription: Subscription | null;
  
  // Time-based trial info (7-day free trial)
  hasActiveTrial: boolean;
  trialStartedAt: Date | null;
  trialExpiresAt: Date | null;
  trialDaysRemaining: number;
  isTrialExpired: boolean;
  
  // Cancellation status
  isCanceling: boolean;
  canceledButStillActive: boolean;
  canceledAt: Date | null;
  cancellationReason: CancellationReason | null;
  accessEndsAt: Date | null;
  daysUntilAccessEnds: number;
  
  // Lifetime stats
  lifetimeMinutesUsed: number;
  
  // Subscription period dates (for subscribers)
  periodStart: Date | null;
  periodEnd: Date | null;
  daysRemainingInPeriod: number;
  
  // Access checks
  canRecord: boolean;
  canAccessFeatures: boolean;
  accessReason: 'active_subscription' | 'canceled_but_active' | 'active_trial' | 'trial_expired';
}

/** Subscription plan constants */
export const SUBSCRIPTION_PLAN = {
  name: 'Unlimited Access',
  priceMonthly: 97, // $97/month
  isUnlimited: true, // Unlimited transcription, no minute limits
  freeTrialDays: 7, // 7-day free trial
  features: [
    'Unlimited AI transcription',
    'Speaker diarization',
    'Automatic meeting summaries',
    'Shareable meeting links',
    'Contact & case management',
    'Secure cloud storage',
  ],
} as const;

// =============================================================================
// Trial Helper Functions
// =============================================================================

/**
 * Calculate trial expiration date from start date
 * @param trialStartedAt - When the trial started (ISO string or Date)
 * @returns Trial expiration date
 */
export function getTrialExpirationDate(trialStartedAt: string | Date | null): Date | null {
  if (!trialStartedAt) return null;
  const startDate = new Date(trialStartedAt);
  const expirationDate = new Date(startDate);
  expirationDate.setDate(expirationDate.getDate() + SUBSCRIPTION_PLAN.freeTrialDays);
  return expirationDate;
}

/**
 * Check if trial is currently active
 * @param trialStartedAt - When the trial started
 * @returns True if trial is still active
 */
export function isTrialActive(trialStartedAt: string | Date | null): boolean {
  const expirationDate = getTrialExpirationDate(trialStartedAt);
  if (!expirationDate) return false;
  return expirationDate > new Date();
}

/**
 * Get days remaining in trial
 * @param trialStartedAt - When the trial started
 * @returns Number of days remaining (0 if expired)
 */
export function getTrialDaysRemaining(trialStartedAt: string | Date | null): number {
  const expirationDate = getTrialExpirationDate(trialStartedAt);
  if (!expirationDate) return 0;
  
  const now = new Date();
  const diffMs = expirationDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Format trial status message for display
 * @param trialStartedAt - When the trial started
 * @param hasSubscription - Whether user has active subscription
 * @returns User-friendly status message
 */
export function formatTrialStatusMessage(
  trialStartedAt: string | Date | null,
  hasSubscription: boolean
): string {
  if (hasSubscription) {
    return 'Unlimited Access';
  }
  
  const daysRemaining = getTrialDaysRemaining(trialStartedAt);
  
  if (daysRemaining === 0) {
    return 'Trial expired - Subscribe to continue';
  }
  
  if (daysRemaining === 1) {
    return 'Trial ends tomorrow';
  }
  
  return `${daysRemaining} days left in trial`;
}

/** 
 * Calculate overage charge in dollars 
 * @param overageMinutes - Number of minutes over the included allowance
 * @param overageRateCents - Rate per minute in cents (default 100 = $1.00)
 */
export function calculateOverageCharge(overageMinutes: number, overageRateCents: number = 100): number {
  if (overageMinutes <= 0) return 0;
  return (overageMinutes * overageRateCents) / 100;
}

/**
 * Format usage as a readable string
 * @param minutesUsed - Minutes used this period
 * @param minutesIncluded - Minutes included in plan
 */
export function formatUsage(minutesUsed: number, minutesIncluded: number): string {
  if (minutesUsed <= minutesIncluded) {
    return `${minutesUsed}/${minutesIncluded} min`;
  }
  const overage = minutesUsed - minutesIncluded;
  return `${minutesUsed}/${minutesIncluded} min (+${overage} overage)`;
}

/**
 * Calculate days remaining in billing period
 * @param periodEnd - Period end date
 */
export function getDaysRemainingInPeriod(periodEnd: Date | null): number {
  if (!periodEnd) return 0;
  const now = new Date();
  const diffMs = periodEnd.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

// =============================================================================
// Billing Types & Constants
// =============================================================================

/** Common currency symbols for billing */
export const CURRENCY_SYMBOLS = [
  { symbol: '$', name: 'US Dollar (USD)' },
  { symbol: '€', name: 'Euro (EUR)' },
  { symbol: '£', name: 'British Pound (GBP)' },
  { symbol: '¥', name: 'Japanese Yen (JPY)' },
  { symbol: 'C$', name: 'Canadian Dollar (CAD)' },
  { symbol: 'A$', name: 'Australian Dollar (AUD)' },
  { symbol: '₹', name: 'Indian Rupee (INR)' },
  { symbol: 'CHF', name: 'Swiss Franc (CHF)' },
] as const;

/** Billing summary for a contact */
export interface ContactBillingSummary {
  totalHours: number;
  totalAmount: number;
  billableMeetingsCount: number;
}

// Meeting Type
export interface MeetingType {
  id: string;
  user_id: string;
  name: string;
  color: string;
  is_default: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Contact Types
// =============================================================================

/** External CRM source for contact sync */
export type ExternalContactSource = 'clio' | 'practicepanther' | null;

// Contact Category (Client, Opposing Counsel, Witness, Expert, Co-Counsel)
export interface ContactCategory {
  id: string;
  user_id: string;
  name: string;
  color: string;
  is_default: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// Contact
export interface Contact {
  id: string;
  user_id: string;
  category_id: string | null;
  first_name: string;
  last_name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  // Future CRM integration fields
  external_id: string | null;
  external_source: ExternalContactSource;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// Contact with category details
export interface ContactWithCategory extends Contact {
  category?: ContactCategory;
}

// Default contact category colors
export const DEFAULT_CONTACT_CATEGORY_COLORS = [
  '#3B82F6', // Blue - Client
  '#EF4444', // Red - Opposing Counsel
  '#8B5CF6', // Purple - Witness
  '#F59E0B', // Orange - Expert
  '#10B981', // Green - Co-Counsel
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

// =============================================================================
// Meeting Share Types
// =============================================================================

/** Meeting share record for public sharing */
export interface MeetingShare {
  id: string;
  meeting_id: string;
  share_token: string;
  password_hash: string | null;
  is_active: boolean;
  view_count: number;
  last_viewed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Input for creating a new share link */
export interface CreateMeetingShareInput {
  meetingId: string;
  password?: string; // Optional password (will be hashed before storage)
  expiresAt?: string; // Optional expiration date
}

/** Share link data returned to the client */
export interface MeetingShareLink {
  id: string;
  shareUrl: string;
  hasPassword: boolean;
  isActive: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/**
 * Generate a cryptographically secure share token
 * @returns 32-character random hex string
 */
export function generateShareToken(): string {
  const randomBytes = Crypto.getRandomBytes(16);
  return Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Helper to format contact display name
export function formatContactName(contact: Contact): string {
  if (contact.last_name) {
    return `${contact.first_name} ${contact.last_name}`;
  }
  return contact.first_name;
}

// Helper to get contact initials for avatar
export function getContactInitials(contact: Contact): string {
  const first = contact.first_name?.charAt(0) || '';
  const last = contact.last_name?.charAt(0) || '';
  return (first + last).toUpperCase() || '?';
}

// =============================================================================
// AssemblyAI Configuration Types
// =============================================================================

/**
 * AssemblyAI speech models
 * - 'slam-1': Best accuracy for English audio (SLAM-1 model)
 * - 'best': Universal model, supports 99+ languages
 */
export type SpeechModel = 'slam-1' | 'best';

/**
 * Supported transcription languages
 * Default: 'en' (English) - uses SLAM-1 model
 * Other languages use Universal ('best') model
 */
export type TranscriptionLanguage = 
  | 'en'  // English (SLAM-1)
  | 'es'  // Spanish
  | 'fr'  // French
  | 'de'  // German
  | 'it'  // Italian
  | 'pt'  // Portuguese
  | 'ja'  // Japanese
  | 'zh'  // Chinese
  | 'ko'; // Korean

/**
 * Summary model options per AssemblyAI docs
 * Used with built-in summarization feature
 */
export type SummaryModel = 'informative' | 'conversational' | 'catchy';

/**
 * Summary type options per AssemblyAI docs
 * Controls the format of the generated summary
 */
export type SummaryType = 'bullets' | 'bullets_verbose' | 'gist' | 'headline' | 'paragraph';

// =============================================================================
// Speaker Feedback Types
// =============================================================================

/**
 * Types of speaker diarization feedback users can submit
 */
export type SpeakerFeedbackType = 
  | 'wrong_speaker_count'   // Detected different number than actual
  | 'speakers_merged'       // Two speakers incorrectly combined as one
  | 'speakers_split'        // One speaker incorrectly split into two
  | 'wrong_attribution'     // Text attributed to wrong speaker
  | 'other';                // Other issues

/**
 * Status of speaker feedback for tracking/resolution
 */
export type SpeakerFeedbackStatus = 'pending' | 'reviewed' | 'resolved';

/**
 * Speaker feedback record for tracking diarization issues
 * All fields except id, meeting_id, user_id, and status are optional
 * to allow users to provide only the information they want to share
 */
export interface SpeakerFeedback {
  id: string;
  meeting_id: string;
  user_id: string;
  feedback_type?: SpeakerFeedbackType | null;
  expected_speakers?: number | null;
  detected_speakers?: number | null;
  notes?: string | null;
  status: SpeakerFeedbackStatus;
  created_at: string;
  updated_at: string;
}

// Meeting
export interface Meeting {
  id: string;
  user_id: string;
  title: string;
  status: MeetingStatus;
  
  // Audio files
  raw_audio_path: string | null;
  mp3_audio_path: string | null;
  raw_audio_format: string | null;
  
  // Metadata
  duration_seconds: number;
  recorded_at: string | null;
  
  // Speaker diarization config
  // 1 = solo (single speaker), 2 = two people (default), 3 = three or more
  expected_speakers: number;
  
  // Speaker diarization validation (populated after transcription)
  detected_speakers: number | null;      // Actual speakers detected by AssemblyAI
  speaker_mismatch: boolean;             // True if detected != expected
  
  // Custom speaker names (set by user or AI)
  // Keys are original labels (Speaker A, Speaker B), values are custom names
  speaker_names: Record<string, string> | null;
  
  // Transcription settings
  transcription_language: string;        // Language code (default: 'en')
  speech_model_used: string | null;      // Model used: 'slam-1' or 'best'
  
  // Meeting type
  meeting_type_id: string | null;
  
  // Contact (one primary contact per meeting)
  contact_id: string | null;
  
  // Billing
  is_billable: boolean;
  billable_hours: number | null;
  billable_amount: number | null;
  billable_amount_manual: boolean;
  
  // Processing
  error_message: string | null;
  
  // Streaming transcription
  live_transcript_data: Record<string, unknown> | null;
  used_streaming_transcription: boolean;
  
  created_at: string;
  updated_at: string;
}

// Transcript
export interface Transcript {
  id: string;
  meeting_id: string;
  full_text: string | null;
  summary: string | null;
  assemblyai_transcript_id: string | null;
  created_at: string;
}

// Transcript segment (with speaker diarization)
export interface TranscriptSegment {
  id: string;
  meeting_id: string;
  speaker: string;
  text: string;
  start_ms: number;
  end_ms: number;
  confidence: number | null;
  
  // Streaming metadata
  is_streaming_result: boolean;
  streaming_session_id: string | null;
  
  created_at: string;
}

// Processing job
export interface ProcessingJob {
  id: string;
  meeting_id: string;
  status: ProcessingJobStatus;
  step: ProcessingStep;
  attempts: number;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Meeting with contact info (used in list views)
export interface MeetingWithContact extends Meeting {
  contact?: {
    id: string;
    first_name: string;
    last_name: string | null;
    category_id: string | null;
    category?: {
      id: string;
      name: string;
      color: string;
    } | null;
  } | null;
}

// Meeting with all related data
export interface MeetingWithDetails extends Meeting {
  transcript?: Transcript;
  segments?: TranscriptSegment[];
  processing_job?: ProcessingJob;
  meeting_type?: MeetingType;
  contact?: ContactWithCategory;
}

// Helper function to get status display info
export function getStatusInfo(status: MeetingStatus): { label: string; color: string } {
  switch (status) {
    case 'uploading':
      return { label: 'Uploading', color: '#F59E0B' };
    case 'queued':
      return { label: 'Queued', color: '#6B7280' };
    case 'converting':
      return { label: 'Converting Audio', color: '#3B82F6' };
    case 'transcribing':
      return { label: 'Transcribing', color: '#8B5CF6' };
    case 'ready':
      return { label: 'Ready', color: '#10B981' };
    case 'failed':
      return { label: 'Failed', color: '#EF4444' };
    default:
      return { label: 'Unknown', color: '#6B7280' };
  }
}

// Helper to format duration with clear unit labels
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  // Under 1 minute: show just seconds (e.g., "37s")
  if (hrs === 0 && mins === 0) {
    return `${secs}s`;
  }
  
  // Under 1 hour: show minutes and seconds (e.g., "2m 37s" or "5m")
  if (hrs === 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  
  // 1 hour or more: show hours and minutes (e.g., "1h 30m" or "2h")
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

// Helper to format timestamp from milliseconds to readable time
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// =============================================================================
// Billing Helper Functions
// =============================================================================

/**
 * Convert seconds to billable hours, rounding UP to the nearest minute
 * Never rounds down - always rounds up for billing purposes
 */
export function secondsToHoursRoundUp(seconds: number): number {
  if (seconds <= 0) return 0;
  // Round up to nearest minute (60 seconds)
  const minutes = Math.ceil(seconds / 60);
  // Convert minutes to hours with 2 decimal places
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Format currency amount with symbol
 * @param amount - The amount to format
 * @param symbol - Currency symbol (e.g., '$', '€', '£')
 * @returns Formatted string like "$1,234.56"
 */
export function formatCurrency(amount: number | null, symbol: string = '$'): string {
  if (amount === null || amount === undefined) return `${symbol}0.00`;
  return `${symbol}${amount.toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })}`;
}

/**
 * Format billable hours for display in hours and minutes
 * @param hours - Number of hours (decimal)
 * @returns Formatted string like "2h 30m" or "45m"
 */
export function formatBillableHours(hours: number | null): string {
  if (hours === null || hours === undefined || hours === 0) return '0m';
  
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  
  if (h > 0 && m > 0) {
    return `${h}h ${m}m`;
  } else if (h > 0) {
    return `${h}h`;
  }
  return `${m}m`;
}

/**
 * Calculate billable amount from hours and rate
 * @param hours - Billable hours
 * @param hourlyRate - Hourly rate
 * @returns Calculated amount or null if inputs are invalid
 */
export function calculateBillableAmount(hours: number | null, hourlyRate: number | null): number | null {
  if (hours === null || hourlyRate === null || hours <= 0 || hourlyRate <= 0) {
    return null;
  }
  // Round to 2 decimal places
  return Math.round(hours * hourlyRate * 100) / 100;
}

/**
 * Format duration as readable hours and minutes for billing context
 * e.g., "2h 30m" or "45m"
 */
export function formatDurationForBilling(seconds: number): string {
  if (seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60); // Round up minutes
  
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

// Default meeting type colors for creating new types
export const DEFAULT_TYPE_COLORS = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#F59E0B', // Orange
  '#10B981', // Green
  '#EF4444', // Red
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

// =============================================================================
// Date/Time & Duration Helper Functions
// =============================================================================

/**
 * Get color for duration display based on meeting length
 * @param seconds - Duration in seconds
 * @returns Hex color string (green: <30m, blue: 30-60m, orange: >60m)
 */
export function getDurationColor(seconds: number): string {
  if (seconds < 1800) return '#10B981'; // < 30 min - green
  if (seconds < 3600) return '#3B82F6'; // 30-60 min - blue
  return '#F59E0B'; // > 60 min - orange
}

/**
 * Format date/time in compact format with relative day names
 * @param date - Date to format
 * @returns Formatted string like "Today • 3:30 PM" or "Dec 24 • 3:30 PM"
 */
export function formatCompactDateTime(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) return `Today • ${time}`;
  if (isYesterday) return `Yesterday • ${time}`;
  
  const month = date.toLocaleDateString([], { month: 'short' });
  const day = date.getDate();
  return `${month} ${day} • ${time}`;
}

/**
 * Format recording timeline showing start and end times
 * @param startDate - Recording start time
 * @param durationSeconds - Recording duration in seconds
 * @returns Formatted string like "Started 2:15 PM → Ended 3:00 PM"
 */
export function formatRecordingTimeline(
  startDate: Date, 
  durationSeconds: number
): string {
  const endDate = new Date(startDate.getTime() + durationSeconds * 1000);
  const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `Started ${startTime} → Ended ${endTime}`;
}

// =============================================================================
// Streaming Transcription Types
// =============================================================================

/**
 * Streaming session record
 * Matches the streaming_sessions database table
 */
export interface StreamingSession {
  id: string;
  meeting_id: string;
  assemblyai_session_id: string;
  expires_at: string | null;
  started_at: string;
  ended_at: string | null;
  last_activity_at: string;
  chunks_processed: number;
  status: StreamingSessionStatus;
  error_message: string | null;
  created_at: string;
}

/**
 * Transcript turn for real-time display
 * Maps to AssemblyAI FinalTranscript message structure
 */
export interface TranscriptTurn {
  id: string;
  speaker: string;
  text: string;
  startMs: number;   // audio_start from AssemblyAI
  endMs: number;     // audio_end from AssemblyAI
  confidence: number;
  isFinal: boolean;
}

/**
 * Audio chunk for streaming
 * Sent to Edge Function for processing
 */
export interface AudioChunk {
  meetingId: string;
  audioBase64: string;
  chunkIndex: number;
  format: string;
  durationMs: number;
}

/**
 * Chunk processing result from Edge Function
 */
export interface ChunkProcessingResult {
  partialText: string;
  finalSegments: Array<{
    text: string;
    speaker: string;
    startMs: number;
    endMs: number;
    confidence: number;
  }>;
  chunkIndex: number;
}

// =============================================================================
// AssemblyAI v3 Streaming API Message Types
// =============================================================================

/**
 * AssemblyAI v3 Begin message
 * Received when streaming session starts
 */
export interface AssemblyAIV3Begin {
  type: 'Begin';
  id: string;          // Session UUID
  expires_at: string;  // ISO 8601 timestamp
}

/**
 * AssemblyAI v3 Word in a turn
 */
export interface AssemblyAIV3Word {
  text: string;
  start: number;       // Start time in ms
  end: number;         // End time in ms
  confidence: number;  // 0.0 to 1.0
  word_is_final: boolean;
}

/**
 * AssemblyAI v3 Turn message
 * Contains transcription results
 */
export interface AssemblyAIV3Turn {
  type: 'Turn';
  turn_order: number;
  turn_is_formatted: boolean;
  end_of_turn: boolean;
  transcript: string;           // All finalized words
  utterance?: string;           // Complete utterance when ready
  language_code?: string;       // When language detection enabled
  language_confidence?: number; // Language detection confidence
  end_of_turn_confidence: number;
  words: AssemblyAIV3Word[];
}

/**
 * AssemblyAI v3 Termination message
 * Received when session ends
 */
export interface AssemblyAIV3Termination {
  type: 'Termination';
  audio_duration_seconds: number;
  session_duration_seconds: number;
}

/**
 * AssemblyAI v3 Error message
 */
export interface AssemblyAIV3Error {
  error: string;
}

/**
 * Union of all AssemblyAI v3 message types
 */
export type AssemblyAIV3Message = 
  | AssemblyAIV3Begin 
  | AssemblyAIV3Turn 
  | AssemblyAIV3Termination 
  | AssemblyAIV3Error;

// =============================================================================
// Legacy AssemblyAI v2 Types (for batch transcription API)
// =============================================================================

/** @deprecated Use AssemblyAIV3Begin for streaming */
export interface AssemblyAISessionBegins {
  message_type: 'SessionBegins';
  session_id: string;
  expires_at: string;
}

/** @deprecated Use AssemblyAIV3Turn for streaming */
export interface AssemblyAITranscript {
  message_type: 'PartialTranscript' | 'FinalTranscript';
  audio_start: number;
  audio_end: number;
  confidence: number;
  text: string;
  words?: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
    speaker?: string;
  }>;
}

/** @deprecated Use AssemblyAIV3Termination for streaming */
export interface AssemblyAISessionTerminated {
  message_type: 'SessionTerminated';
}

/** @deprecated Use AssemblyAIV3Error for streaming */
export interface AssemblyAIError {
  error: string;
}

/** @deprecated Use AssemblyAIV3Message for streaming */
export type AssemblyAIMessage = 
  | AssemblyAISessionBegins 
  | AssemblyAITranscript 
  | AssemblyAISessionTerminated 
  | AssemblyAIError;

// =============================================================================
// Edge Function Types
// =============================================================================

/** Request to start streaming session */
export interface StartSessionRequest {
  meeting_id: string;
}

/** Response from start session */
export interface StartSessionResponse {
  session_id: string;
  expires_at: string;
  meeting_id: string;
}

/** Request to process audio chunk */
export interface ProcessChunkRequest {
  meeting_id: string;
  audio_base64: string;
  chunk_index: number;
  format: string;
}

/** Response from process chunk */
export interface ProcessChunkResponse {
  partial_text: string;
  final_segments: Array<{
    text: string;
    speaker: string;
    start_ms: number;
    end_ms: number;
    confidence: number;
  }>;
  chunk_index: number;
}

/** Request to end streaming session */
export interface EndSessionRequest {
  meeting_id: string;
  session_id: string;
}
