/**
 * Types for Legal Meeting Assistant
 * 
 * Includes types for:
 * - Meeting management
 * - Transcript handling
 * - Streaming transcription sessions
 * - Audio chunk processing
 */

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
// AssemblyAI Message Types
// =============================================================================

/**
 * AssemblyAI SessionBegins message
 * Received when streaming session starts
 */
export interface AssemblyAISessionBegins {
  message_type: 'SessionBegins';
  session_id: string;
  expires_at: string;
}

/**
 * AssemblyAI Transcript message (Partial or Final)
 * PartialTranscript: Interim result that may change
 * FinalTranscript: Immutable final result
 */
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

/**
 * AssemblyAI SessionTerminated message
 * Received when session ends
 */
export interface AssemblyAISessionTerminated {
  message_type: 'SessionTerminated';
}

/**
 * AssemblyAI Error message
 */
export interface AssemblyAIError {
  error: string;
}

/**
 * Union of all AssemblyAI message types
 */
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
