/**
 * useChunkedRecording Hook
 * 
 * Manages chunked audio recording for real-time streaming transcription.
 * Uses Expo Audio APIs per official documentation.
 * 
 * Recording Flow:
 * 1. Request permissions via AudioModule.requestRecordingPermissionsAsync()
 * 2. Configure audio mode via setAudioModeAsync(RECORDING_AUDIO_MODE)
 * 3. Start streaming session via Edge Function
 * 4. Record in chunks using useAudioRecorder
 * 5. Send each chunk to Edge Function for processing
 * 6. Repeat until user stops
 * 
 * @see .cursor/expo-audio-documentation.md
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  setAudioModeAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system";
import { supabase } from "@/lib/supabase";
import {
  SPEECH_RECORDING_OPTIONS,
  RECORDING_AUDIO_MODE,
  PLAYBACK_AUDIO_MODE,
  CHUNK_DURATION_MS,
  AUDIO_FILE_CONFIG,
} from "@/lib/audio-config";

/**
 * Transcript segment from streaming API
 */
export interface StreamingSegment {
  text: string;
  speaker: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

/**
 * Result from processing a chunk
 */
export interface ChunkResult {
  partialText: string;
  finalSegments: StreamingSegment[];
  chunkIndex: number;
}

/**
 * Callback for when a chunk is processed
 */
export type OnChunkProcessedCallback = (result: ChunkResult) => void;

/**
 * State returned by the hook
 */
export interface ChunkedRecordingState {
  // From useAudioRecorderState
  isRecording: boolean;
  durationMillis: number;
  canRecord: boolean;
  
  // Custom state
  hasPermission: boolean;
  isInitialized: boolean;
  sessionId: string | null;
  chunkIndex: number;
  isProcessingChunk: boolean;
  error: string | null;
  
  // Accumulated data
  totalChunksProcessed: number;
}

/**
 * Actions returned by the hook
 */
export interface ChunkedRecordingActions {
  startSession: (meetingId: string) => Promise<void>;
  stopSession: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
}

/**
 * Custom hook for chunked audio recording with streaming transcription
 */
export function useChunkedRecording(
  onChunkProcessed?: OnChunkProcessedCallback
): ChunkedRecordingState & ChunkedRecordingActions {
  // Expo Audio recorder hook
  const audioRecorder = useAudioRecorder(SPEECH_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(audioRecorder);

  // Custom state
  const [hasPermission, setHasPermission] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [isProcessingChunk, setIsProcessingChunk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalChunksProcessed, setTotalChunksProcessed] = useState(0);

  // Refs for managing recording loop
  const meetingIdRef = useRef<string | null>(null);
  const isRecordingLoopActive = useRef(false);
  const isPausedRef = useRef(false);
  const chunkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Request microphone permissions
   * Per Expo Audio docs: AudioModule.requestRecordingPermissionsAsync()
   */
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      console.log("[useChunkedRecording] Requesting permissions...");
      const status = await AudioModule.requestRecordingPermissionsAsync();
      
      if (status.granted) {
        console.log("[useChunkedRecording] Permission granted");
        setHasPermission(true);
        return true;
      } else {
        console.log("[useChunkedRecording] Permission denied");
        setError("Microphone permission denied");
        return false;
      }
    } catch (err) {
      console.error("[useChunkedRecording] Permission error:", err);
      setError(err instanceof Error ? err.message : "Permission request failed");
      return false;
    }
  }, []);

  /**
   * Configure audio mode for recording
   * Per Expo Audio docs: setAudioModeAsync(mode)
   */
  const configureAudioMode = useCallback(async (forRecording: boolean): Promise<void> => {
    try {
      console.log(`[useChunkedRecording] Configuring audio mode: ${forRecording ? "recording" : "playback"}`);
      await setAudioModeAsync(forRecording ? RECORDING_AUDIO_MODE : PLAYBACK_AUDIO_MODE);
    } catch (err) {
      console.error("[useChunkedRecording] Audio mode error:", err);
      throw err;
    }
  }, []);

  /**
   * Start streaming session with Edge Function
   * Calls streaming-transcribe with action: "start-session"
   */
  const startStreamingSession = useCallback(async (meetingId: string): Promise<string> => {
    console.log("[useChunkedRecording] Starting streaming session...");
    
    // Check if we have an active session before calling the function
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error("No active session. Please log in again.");
    }
    console.log("[useChunkedRecording] Auth session active, user:", session.user.id);
    
    const { data, error: fnError } = await supabase.functions.invoke(
      "streaming-transcribe",
      { 
        body: { 
          action: "start-session",
          meeting_id: meetingId 
        } 
      }
    );

    if (fnError) {
      console.error("[useChunkedRecording] Function error details:", fnError);
      // Try to parse the error body for more details
      let errorMessage = fnError.message || "Unknown error";
      if (fnError.context?.body) {
        try {
          const errorBody = JSON.parse(fnError.context.body);
          errorMessage = errorBody.error || errorMessage;
        } catch {
          // Use default message
        }
      }
      throw new Error(`Failed to start session: ${errorMessage}`);
    }

    if (!data?.session_id) {
      console.error("[useChunkedRecording] Response data:", data);
      throw new Error(data?.error || "No session_id returned from Edge Function");
    }

    console.log(`[useChunkedRecording] Session started: ${data.session_id}`);
    return data.session_id;
  }, []);

  /**
   * Process a single audio chunk
   * Calls streaming-transcribe with action: "process-chunk"
   */
  const processChunk = useCallback(async (
    meetingId: string,
    audioBase64: string,
    index: number
  ): Promise<ChunkResult> => {
    console.log(`[useChunkedRecording] Processing chunk ${index}...`);
    
    const { data, error: fnError } = await supabase.functions.invoke(
      "streaming-transcribe",
      {
        body: {
          action: "process-chunk",
          meeting_id: meetingId,
          audio_base64: audioBase64,
          chunk_index: index,
          format: AUDIO_FILE_CONFIG.FORMAT,
        },
      }
    );

    if (fnError) {
      console.error("[useChunkedRecording] Chunk processing error:", fnError);
      throw fnError;
    }

    const result: ChunkResult = {
      partialText: data?.partial_text || "",
      finalSegments: (data?.final_segments || []).map((seg: any) => ({
        text: seg.text,
        speaker: seg.speaker,
        startMs: seg.start_ms,
        endMs: seg.end_ms,
        confidence: seg.confidence,
      })),
      chunkIndex: index,
    };

    console.log(`[useChunkedRecording] Chunk ${index} processed: ${result.finalSegments.length} segments`);
    return result;
  }, []);

  /**
   * End streaming session
   * Calls streaming-transcribe with action: "end-session"
   */
  const endStreamingSession = useCallback(async (meetingId: string, sessId: string): Promise<void> => {
    console.log("[useChunkedRecording] Ending streaming session...");
    
    try {
      await supabase.functions.invoke("streaming-transcribe", {
        body: { 
          action: "end-session",
          meeting_id: meetingId, 
          session_id: sessId 
        },
      });
      console.log("[useChunkedRecording] Session ended");
    } catch (err) {
      console.error("[useChunkedRecording] Error ending session:", err);
    }
  }, []);

  /**
   * Record a single chunk and process it
   */
  const recordAndProcessChunk = useCallback(async (): Promise<void> => {
    if (!meetingIdRef.current || !isRecordingLoopActive.current || isPausedRef.current) {
      return;
    }

    const currentChunkIndex = chunkIndex;
    setIsProcessingChunk(true);

    try {
      // Prepare to record
      console.log(`[useChunkedRecording] Starting chunk ${currentChunkIndex}...`);
      await audioRecorder.prepareToRecordAsync();
      
      // Start recording
      audioRecorder.record();

      // Wait for chunk duration
      await new Promise((resolve) => {
        chunkTimeoutRef.current = setTimeout(resolve, CHUNK_DURATION_MS);
      });

      // Stop recording - file available at audioRecorder.uri
      await audioRecorder.stop();
      const uri = audioRecorder.uri;

      if (!uri) {
        console.warn("[useChunkedRecording] No recording URI");
        return;
      }

      // Read file as base64
      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });

      // Delete temp file
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {
        // Ignore deletion errors
      }

      // Process chunk
      if (meetingIdRef.current && isRecordingLoopActive.current) {
        const result = await processChunk(meetingIdRef.current, audioBase64, currentChunkIndex);
        
        // Notify callback
        if (onChunkProcessed) {
          onChunkProcessed(result);
        }

        setChunkIndex((prev) => prev + 1);
        setTotalChunksProcessed((prev) => prev + 1);
      }
    } catch (err) {
      console.error("[useChunkedRecording] Chunk recording error:", err);
      setError(err instanceof Error ? err.message : "Recording error");
    } finally {
      setIsProcessingChunk(false);
    }

    // Continue recording loop
    if (isRecordingLoopActive.current && !isPausedRef.current) {
      // Use setTimeout to avoid stack overflow
      setTimeout(() => {
        recordAndProcessChunk();
      }, 100);
    }
  }, [audioRecorder, chunkIndex, processChunk, onChunkProcessed]);

  /**
   * Start recording session
   */
  const startSession = useCallback(async (meetingId: string): Promise<void> => {
    try {
      setError(null);
      meetingIdRef.current = meetingId;

      // Request permissions if needed
      if (!hasPermission) {
        const granted = await requestPermissions();
        if (!granted) {
          throw new Error("Microphone permission required");
        }
      }

      // Configure audio mode for recording
      await configureAudioMode(true);

      // Start streaming session
      const sessId = await startStreamingSession(meetingId);
      setSessionId(sessId);

      // Reset state
      setChunkIndex(0);
      setTotalChunksProcessed(0);
      setIsInitialized(true);

      // Start recording loop
      isRecordingLoopActive.current = true;
      isPausedRef.current = false;

      console.log("[useChunkedRecording] Recording session started");
      
      // Begin chunk recording
      recordAndProcessChunk();
    } catch (err) {
      console.error("[useChunkedRecording] Start session error:", err);
      setError(err instanceof Error ? err.message : "Failed to start session");
      throw err;
    }
  }, [hasPermission, requestPermissions, configureAudioMode, startStreamingSession, recordAndProcessChunk]);

  /**
   * Stop recording session
   */
  const stopSession = useCallback(async (): Promise<void> => {
    console.log("[useChunkedRecording] Stopping session...");
    
    // Stop recording loop
    isRecordingLoopActive.current = false;
    isPausedRef.current = false;

    // Clear any pending timeout
    if (chunkTimeoutRef.current) {
      clearTimeout(chunkTimeoutRef.current);
      chunkTimeoutRef.current = null;
    }

    // Stop current recording if active
    if (recorderState.isRecording) {
      try {
        await audioRecorder.stop();
      } catch {
        // Ignore stop errors
      }
    }

    // End streaming session
    if (meetingIdRef.current && sessionId) {
      await endStreamingSession(meetingIdRef.current, sessionId);
    }

    // Reset audio mode
    await configureAudioMode(false);

    // Reset state
    setSessionId(null);
    meetingIdRef.current = null;

    console.log("[useChunkedRecording] Session stopped");
  }, [audioRecorder, recorderState.isRecording, sessionId, endStreamingSession, configureAudioMode]);

  /**
   * Pause recording
   */
  const pauseRecording = useCallback((): void => {
    console.log("[useChunkedRecording] Pausing...");
    isPausedRef.current = true;
    
    // Clear pending timeout
    if (chunkTimeoutRef.current) {
      clearTimeout(chunkTimeoutRef.current);
      chunkTimeoutRef.current = null;
    }

    // Pause current recording
    if (recorderState.isRecording) {
      audioRecorder.pause();
    }
  }, [audioRecorder, recorderState.isRecording]);

  /**
   * Resume recording
   */
  const resumeRecording = useCallback((): void => {
    console.log("[useChunkedRecording] Resuming...");
    isPausedRef.current = false;

    // Resume recording loop
    if (isRecordingLoopActive.current) {
      recordAndProcessChunk();
    }
  }, [recordAndProcessChunk]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      isRecordingLoopActive.current = false;
      if (chunkTimeoutRef.current) {
        clearTimeout(chunkTimeoutRef.current);
      }
    };
  }, []);

  return {
    // From useAudioRecorderState
    isRecording: recorderState.isRecording,
    durationMillis: recorderState.durationMillis,
    canRecord: recorderState.canRecord,

    // Custom state
    hasPermission,
    isInitialized,
    sessionId,
    chunkIndex,
    isProcessingChunk,
    error,
    totalChunksProcessed,

    // Actions
    startSession,
    stopSession,
    pauseRecording,
    resumeRecording,
  };
}

export default useChunkedRecording;

