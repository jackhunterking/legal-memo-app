export type MeetingStatus = 'recording' | 'uploading' | 'processing' | 'ready' | 'failed';

export type AudioFormat = 'pending' | 'transcoding' | 'm4a' | 'webm' | 'failed';

export interface MeetingType {
  id: string;
  user_id: string;
  name: string;
  color: string;
  is_active: boolean;
  is_default: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type SpeakerLabel = 'LAWYER' | 'CLIENT' | 'OTHER' | 'UNKNOWN';

export type Certainty = 'explicit' | 'unclear';

export interface Profile {
  id: string;
  email: string;
  default_hourly_rate: number;
  last_billable_setting: boolean;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: string;
  user_id: string;
  auto_title: string;
  title_override: string | null;
  meeting_type_id: string | null;
  meeting_type?: MeetingType;
  client_name: string | null;
  primary_contact_id: string | null;
  status: MeetingStatus;
  audio_path: string | null;
  audio_format: AudioFormat;
  duration_seconds: number;
  billable: boolean;
  billable_seconds: number;
  hourly_rate_snapshot: number;
  error_message: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingConsentLog {
  id: string;
  meeting_id: string;
  user_id: string;
  informed_participants: boolean;
  recording_lawful: boolean;
  consented_at: string;
  device_info: string | null;
}

export interface TranscriptSegment {
  id: string;
  meeting_id: string;
  speaker_label: SpeakerLabel;
  speaker_name: string | null;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number | null;
}

export interface TimestampSupport {
  start_ms: number;
  end_ms: number;
}

export interface SummaryItem {
  text: string;
  support: TimestampSupport[];
  certainty: Certainty;
}

export interface KeyFact {
  fact: string;
  support: TimestampSupport[];
  certainty: Certainty;
}

export interface LegalIssue {
  issue: string;
  support: TimestampSupport[];
  certainty: Certainty;
}

export interface Decision {
  decision: string;
  support: TimestampSupport[];
  certainty: Certainty;
}

export interface Risk {
  risk: string;
  support: TimestampSupport[];
  certainty: Certainty;
}

export interface OpenQuestion {
  question: string;
  support: TimestampSupport[];
  certainty: Certainty;
}

export interface Participant {
  label: SpeakerLabel;
  name: string | null;
}

export interface MeetingOverview {
  one_sentence_summary: string;
  participants: Participant[];
  topics: string[];
}

export interface FollowUpAction {
  action: string;
  owner: SpeakerLabel;
  deadline: string | null;
  support: TimestampSupport[];
  certainty: Certainty;
  completed?: boolean;
}

export interface AIOutput {
  id: string;
  meeting_id: string;
  provider: string;
  model: string;
  meeting_overview: MeetingOverview;
  key_facts_stated: KeyFact[];
  legal_issues_discussed: LegalIssue[];
  decisions_made: Decision[];
  risks_or_concerns_raised: Risk[];
  follow_up_actions: FollowUpAction[];
  open_questions: OpenQuestion[];
  disclaimer: string;
  created_at: string;
}

export interface MeetingJob {
  id: string;
  meeting_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  step: 'transcribe' | 'summarize' | 'index' | null;
  attempts: number;
  last_error: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingWithDetails extends Meeting {
  ai_output?: AIOutput;
  transcript_segments?: TranscriptSegment[];
}

// Default meeting type names (for reference)
export const DEFAULT_MEETING_TYPE_NAMES = [
  'General Legal Meeting',
  'Client Consultation',
  'Case Review',
  'Settlement Discussion',
  'Contract Negotiation',
  'Witness Interview',
  'Internal Meeting',
] as const;

export type ContactRole = 'CLIENT' | 'LAWYER' | 'OTHER';

export interface Contact {
  id: string;
  user_id: string;
  full_name: string;
  role: ContactRole;
  company: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const CONTACT_ROLES: ContactRole[] = ['CLIENT', 'LAWYER', 'OTHER'];
