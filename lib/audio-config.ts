/**
 * Audio Configuration
 * 
 * Centralized audio configuration using Expo Audio terminology.
 * Based on official Expo Audio documentation.
 * 
 * @see .cursor/expo-audio-documentation.md
 */

import {
  RecordingPresets,
  type RecordingOptions,
  type AudioMode,
} from "expo-audio";

/**
 * RecordingOptions optimized for speech transcription.
 * Based on RecordingPresets.HIGH_QUALITY but configured for mono audio
 * which is better for speech clarity and smaller file sizes.
 * 
 * Note: Expo Audio records at 44.1kHz in M4A/AAC format.
 * The Edge Function will convert to PCM16 @ 16kHz for AssemblyAI.
 */
export const SPEECH_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1, // Mono for speech clarity
};

/**
 * AudioMode configuration for active recording sessions.
 * Per Expo Audio docs:
 * - allowsRecording: true - Required to enable recording
 * - playsInSilentMode: true - Audio continues in silent mode (iOS)
 * - allowsBackgroundRecording: true - Recording continues in background
 * 
 * Note: enableBackgroundRecording must also be set in app.json plugin config
 */
export const RECORDING_AUDIO_MODE: Partial<AudioMode> = {
  allowsRecording: true,
  playsInSilentMode: true,
  allowsBackgroundRecording: true,
};

/**
 * AudioMode configuration for playback (after recording ends).
 * Disables recording mode to free up resources.
 */
export const PLAYBACK_AUDIO_MODE: Partial<AudioMode> = {
  allowsRecording: false,
  playsInSilentMode: true,
};

/**
 * Chunk duration in milliseconds for streaming transcription.
 * 
 * AssemblyAI recommends chunks between 50ms - 1000ms.
 * We use 2000ms (2 seconds) because:
 * - Expo Audio records to file, so we need time to write/read
 * - Provides enough speech context for better transcription
 * - Balances latency vs accuracy
 */
export const CHUNK_DURATION_MS = 2000;

/**
 * AssemblyAI streaming configuration
 */
export const ASSEMBLYAI_CONFIG = {
  // WebSocket endpoint for streaming API v3
  STREAMING_URL: "wss://streaming.assemblyai.com/v3/ws",
  // Required sample rate for AssemblyAI
  SAMPLE_RATE: 16000,
  // Audio encoding format
  ENCODING: "pcm_s16le" as const,
} as const;

/**
 * File format information for recorded audio
 */
export const AUDIO_FILE_CONFIG = {
  // Extension used by Expo Audio HIGH_QUALITY preset
  EXTENSION: ".m4a",
  // MIME type for the recorded format
  CONTENT_TYPE: "audio/mp4",
  // Format identifier
  FORMAT: "m4a",
} as const;

