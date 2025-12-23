// Meeting statuses
export type MeetingStatus = 'uploading' | 'queued' | 'converting' | 'transcribing' | 'ready' | 'failed';

// Processing job statuses
export type ProcessingJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Processing steps
export type ProcessingStep = 'converting' | 'transcribing' | null;

// Profile
export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  onboarding_completed: boolean;
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
  
  // Processing
  error_message: string | null;
  
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

// Meeting with all related data
export interface MeetingWithDetails extends Meeting {
  transcript?: Transcript;
  segments?: TranscriptSegment[];
  processing_job?: ProcessingJob;
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

// Helper to format duration
export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Helper to format timestamp from milliseconds to readable time
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
