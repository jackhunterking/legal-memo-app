/**
 * Audio Configuration
 * 
 * Centralized audio configuration for the Legal Memo.
 * Supports AssemblyAI v3 Streaming API.
 */

import {
  RecordingPresets,
  type RecordingOptions,
  type AudioMode,
} from "expo-audio";

// =============================================================================
// AssemblyAI v3 Streaming API Configuration
// =============================================================================

/**
 * AssemblyAI v3 Streaming API configuration
 * 
 * v3 API changes from v2:
 * - New WebSocket URL: wss://streaming.assemblyai.com/v3/ws
 * - Auth via token query param or Authorization header (no separate auth message)
 * - Raw binary audio chunks (not JSON wrapped base64)
 * - New message types: Begin, Turn, Termination
 */
export const ASSEMBLYAI_STREAMING_CONFIG = {
  // v3 WebSocket endpoint
  WS_URL: "wss://streaming.assemblyai.com/v3/ws",
  // EU endpoint (if needed)
  WS_URL_EU: "wss://streaming.eu.assemblyai.com/v3/ws",
  // Required sample rate
  SAMPLE_RATE: 16000,
  // Audio encoding (pcm_s16le or pcm_mulaw)
  ENCODING: "pcm_s16le" as const,
  // Default language
  LANGUAGE: "en" as const,
} as const;

/**
 * Live audio stream configuration for react-native-live-audio-stream
 * Outputs PCM16 at 16kHz mono - exactly what AssemblyAI needs
 */
export const LIVE_AUDIO_CONFIG = {
  // Sample rate matches AssemblyAI requirement
  sampleRate: ASSEMBLYAI_STREAMING_CONFIG.SAMPLE_RATE,
  // Mono channel for speech
  channels: 1 as const,
  // 16-bit PCM
  bitsPerSample: 16 as const,
  // Android: VOICE_RECOGNITION source (optimized for speech)
  audioSource: 6,
  // Buffer size (~250ms of audio for low latency)
  bufferSize: 4096,
} as const;

// =============================================================================
// AssemblyAI v3 Message Types
// =============================================================================

/**
 * v3 Begin message - session started
 */
export interface AssemblyAIV3Begin {
  type: "Begin";
  id: string;          // Session UUID
  expires_at: string;  // ISO 8601 timestamp
}

/**
 * v3 Word in a turn
 */
export interface AssemblyAIV3Word {
  text: string;
  start: number;       // Start time in ms
  end: number;         // End time in ms
  confidence: number;  // 0.0 to 1.0
  word_is_final: boolean;
}

/**
 * v3 Turn message - transcription result
 */
export interface AssemblyAIV3Turn {
  type: "Turn";
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
 * v3 Termination message - session ended
 */
export interface AssemblyAIV3Termination {
  type: "Termination";
  audio_duration_seconds: number;
  session_duration_seconds: number;
}

/**
 * v3 Error message
 */
export interface AssemblyAIV3Error {
  error: string;
}

/**
 * Union of all v3 message types
 */
export type AssemblyAIV3Message = 
  | AssemblyAIV3Begin 
  | AssemblyAIV3Turn 
  | AssemblyAIV3Termination 
  | AssemblyAIV3Error;

// =============================================================================
// Legacy Expo Audio Configuration (Fallback for batch processing)
// =============================================================================

/**
 * RecordingOptions for batch transcription (non-streaming).
 * Based on RecordingPresets.HIGH_QUALITY but configured for mono audio.
 * 
 * @deprecated For live streaming, use LIVE_AUDIO_CONFIG instead
 */
export const SPEECH_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1, // Mono for speech clarity
};

/**
 * AudioMode configuration for active recording sessions.
 */
export const RECORDING_AUDIO_MODE: Partial<AudioMode> = {
  allowsRecording: true,
  playsInSilentMode: true,
  allowsBackgroundRecording: true,
};

/**
 * AudioMode configuration for playback.
 */
export const PLAYBACK_AUDIO_MODE: Partial<AudioMode> = {
  allowsRecording: false,
  playsInSilentMode: true,
};

// =============================================================================
// Deprecated configurations (kept for backwards compatibility)
// =============================================================================

/** @deprecated Use ASSEMBLYAI_STREAMING_CONFIG instead */
export const ASSEMBLYAI_REALTIME_CONFIG = ASSEMBLYAI_STREAMING_CONFIG;

/** @deprecated Use ASSEMBLYAI_STREAMING_CONFIG instead */
export const ASSEMBLYAI_CONFIG = ASSEMBLYAI_STREAMING_CONFIG;

/** @deprecated Not used with live streaming */
export const CHUNK_DURATION_MS = 2000;

/** @deprecated Live streaming outputs PCM directly */
export const AUDIO_FILE_CONFIG = {
  EXTENSION: ".m4a",
  CONTENT_TYPE: "audio/mp4",
  FORMAT: "m4a",
} as const;
