/**
 * useLiveAudioStream Hook
 * 
 * Provides real-time audio streaming with live transcription using AssemblyAI v3 API.
 * Uses react-native-live-audio-stream for continuous PCM capture
 * and streams directly to AssemblyAI WebSocket.
 * 
 * AssemblyAI v3 Streaming API:
 * - WebSocket URL: wss://streaming.assemblyai.com/v3/ws
 * - Auth: token query parameter (no auth message needed)
 * - Audio: Raw binary PCM chunks (not JSON wrapped)
 * - Messages: Begin, Turn, Termination
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Platform, PermissionsAndroid } from "react-native";
import LiveAudioStream from "react-native-live-audio-stream";
import { File, Paths } from "expo-file-system";
import { supabase, getAssemblyToken, getFunctionsAuthStatus } from "@/lib/supabase";
import { 
  ASSEMBLYAI_STREAMING_CONFIG, 
  LIVE_AUDIO_CONFIG,
  type AssemblyAIV3Message,
  type AssemblyAIV3Begin,
  type AssemblyAIV3Turn,
  type AssemblyAIV3Termination,
} from "@/lib/audio-config";
import type { TranscriptTurn } from "@/types";

// Debug logging prefix
const LOG_PREFIX = "[useLiveAudioStream]";

// Configuration
const SAMPLE_RATE = ASSEMBLYAI_STREAMING_CONFIG.SAMPLE_RATE;
const WS_URL = ASSEMBLYAI_STREAMING_CONFIG.WS_URL;

/**
 * Decode base64 string to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Create WAV header as Uint8Array
 */
function createWavHeader(dataLength: number, sampleRate: number, channels: number, bitsPerSample: number): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  
  // "RIFF" chunk descriptor
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataLength, true); // File size - 8
  view.setUint32(8, 0x57415645, false); // "WAVE"
  
  // "fmt " sub-chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, channels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitsPerSample, true); // BitsPerSample
  
  // "data" sub-chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataLength, true); // Subchunk2Size
  
  return header;
}

/**
 * Save audio chunks to a WAV file on the device
 * Uses new expo-file-system File API (v19+)
 * @returns The File instance for the saved WAV file
 */
async function saveAudioChunksToWavFile(chunks: string[], meetingId: string): Promise<File> {
  console.log(`${LOG_PREFIX} Saving ${chunks.length} audio chunks to WAV file...`);
  
  // 1. Decode all base64 chunks to byte arrays
  const decodedChunks: Uint8Array[] = [];
  let totalDataLength = 0;
  
  for (const chunk of chunks) {
    try {
      const decoded = base64ToUint8Array(chunk);
      decodedChunks.push(decoded);
      totalDataLength += decoded.length;
    } catch (err) {
      console.warn(`${LOG_PREFIX} Failed to decode chunk, skipping:`, err);
    }
  }
  
  console.log(`${LOG_PREFIX} Total audio data: ${totalDataLength} bytes from ${decodedChunks.length} chunks`);
  
  if (totalDataLength === 0) {
    throw new Error('No valid audio data to save');
  }
  
  // 2. Create WAV header
  const wavHeader = createWavHeader(totalDataLength, SAMPLE_RATE, 1, 16);
  
  // 3. Combine header + all audio data into single buffer
  const totalSize = wavHeader.length + totalDataLength;
  const combinedBuffer = new Uint8Array(totalSize);
  
  // Copy header
  combinedBuffer.set(wavHeader, 0);
  
  // Copy all audio chunks
  let offset = wavHeader.length;
  for (const chunk of decodedChunks) {
    combinedBuffer.set(chunk, offset);
    offset += chunk.length;
  }
  
  // 4. Create file using new expo-file-system File API
  const wavFile = new File(Paths.cache, `recording_${meetingId}.wav`);
  
  // 5. Write binary data directly to file
  wavFile.create({ overwrite: true });
  wavFile.write(combinedBuffer);
  
  // Verify file was written
  console.log(`${LOG_PREFIX} WAV file saved: ${wavFile.uri}, exists: ${wavFile.exists}, size: ${wavFile.size} bytes`);
  
  return wavFile;
}

/**
 * State returned by the hook
 */
export interface LiveAudioStreamState {
  // Recording state
  isRecording: boolean;
  isPaused: boolean;
  durationMs: number;
  
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  sessionId: string | null;
  
  // Transcript state
  turns: TranscriptTurn[];
  currentPartial: string;
  
  // Permission state
  hasPermission: boolean;
  
  // Error state
  error: string | null;
}

/**
 * Actions returned by the hook
 */
export interface LiveAudioStreamActions {
  startRecording: (meetingId: string) => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  clearTranscript: () => void;
}

/**
 * Return type for the hook
 */
export type UseLiveAudioStreamReturn = LiveAudioStreamState & LiveAudioStreamActions;

/**
 * Convert base64 to ArrayBuffer for binary WebSocket sending
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Custom hook for live audio streaming with real-time transcription (v3 API)
 */
export function useLiveAudioStream(): UseLiveAudioStreamReturn {
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  // Transcript state
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [currentPartial, setCurrentPartial] = useState("");
  
  // Permission state
  const [hasPermission, setHasPermission] = useState(false);
  
  // Error state
  const [error, setError] = useState<string | null>(null);
  
  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const meetingIdRef = useRef<string | null>(null);
  const turnCounterRef = useRef(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isStreamingRef = useRef(false);
  const currentTurnRef = useRef<string>("");
  
  // Audio chunk collection for post-recording batch processing
  const audioChunksRef = useRef<string[]>([]);
  const userIdRef = useRef<string | null>(null);

  /**
   * Request microphone permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: "Microphone Permission",
            message: "This app needs access to your microphone to record legal memos.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK",
          }
        );
        const permitted = granted === PermissionsAndroid.RESULTS.GRANTED;
        setHasPermission(permitted);
        return permitted;
      } else {
        // iOS permissions handled by expo-audio plugin in app.json
        setHasPermission(true);
        return true;
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Permission error:`, err);
      setError("Microphone permission denied");
      return false;
    }
  }, []);

  /**
   * Get AssemblyAI token from Edge Function
   */
  const getAssemblyAIToken = useCallback(async (): Promise<string> => {
    const startTime = Date.now();
    console.log(`${LOG_PREFIX} ========================================`);
    console.log(`${LOG_PREFIX} getAssemblyAIToken START (v3 API)`);
    console.log(`${LOG_PREFIX} ========================================`);
    
    // Log current auth status
    const authStatus = getFunctionsAuthStatus();
    console.log(`${LOG_PREFIX} Functions auth status:`, JSON.stringify(authStatus, null, 2));
    
    console.log(`${LOG_PREFIX} Calling getAssemblyToken()...`);
    
    let response;
    try {
      response = await getAssemblyToken();
    } catch (invokeError) {
      console.error(`${LOG_PREFIX} getAssemblyToken threw exception:`, invokeError);
      throw new Error(`Failed to invoke Edge Function: ${invokeError instanceof Error ? invokeError.message : String(invokeError)}`);
    }
    
    const { data, error: fnError } = response;
    const elapsed = Date.now() - startTime;
    
    console.log(`${LOG_PREFIX} Response in ${elapsed}ms:`, {
      hasData: !!data,
      hasError: !!fnError,
      apiVersion: data?.api_version,
    });

    if (fnError) {
      console.error(`${LOG_PREFIX} Edge Function error:`, fnError);
      throw new Error(`Failed to get token: ${fnError.message || 'Unknown error'}`);
    }

    if (!data?.token) {
      console.error(`${LOG_PREFIX} No token in response`);
      throw new Error("No token returned from server");
    }

    console.log(`${LOG_PREFIX} Token received:`, {
      tokenLength: data.token.length,
      wsUrl: data.websocket_url,
      apiVersion: data.api_version,
    });
    
    return data.token;
  }, []);

  /**
   * Generate unique turn ID
   */
  const generateTurnId = useCallback((): string => {
    turnCounterRef.current += 1;
    return `turn-${Date.now()}-${turnCounterRef.current}`;
  }, []);

  /**
   * Process a v3 Turn message from AssemblyAI
   */
  const processTurnMessage = useCallback((turn: AssemblyAIV3Turn) => {
    console.log(`${LOG_PREFIX} Processing Turn:`, {
      turn_order: turn.turn_order,
      end_of_turn: turn.end_of_turn,
      transcript_length: turn.transcript?.length,
      word_count: turn.words?.length,
    });

    // Update current partial with transcript
    if (turn.transcript && !turn.end_of_turn) {
      setCurrentPartial(turn.transcript);
      currentTurnRef.current = turn.transcript;
    }

    // When turn is final, save it
    if (turn.end_of_turn && turn.transcript) {
      const text = turn.transcript.trim();
      if (!text) return;

      // Determine speaker from words if available
      let speaker = "Speaker A";
      // v3 doesn't have speaker diarization in streaming yet
      // We'll use turn_order to simulate different speakers for now

      const newTurn: TranscriptTurn = {
        id: generateTurnId(),
        speaker,
        text,
        startMs: turn.words?.[0]?.start ?? 0,
        endMs: turn.words?.[turn.words.length - 1]?.end ?? 0,
        confidence: turn.end_of_turn_confidence,
        isFinal: true,
      };

      setTurns((prevTurns) => {
        // Check if we should merge with the last turn
        const lastTurn = prevTurns[prevTurns.length - 1];
        
        if (
          lastTurn &&
          lastTurn.speaker === newTurn.speaker &&
          newTurn.startMs - lastTurn.endMs < 2000
        ) {
          // Merge with previous turn
          const merged = [...prevTurns];
          merged[merged.length - 1] = {
            ...lastTurn,
            text: `${lastTurn.text} ${newTurn.text}`,
            endMs: newTurn.endMs,
            confidence: (lastTurn.confidence + newTurn.confidence) / 2,
          };
          return merged;
        }

        return [...prevTurns, newTurn];
      });

      // Clear partial after receiving final
      setCurrentPartial("");
      currentTurnRef.current = "";

      // Save to database (fire and forget)
      if (meetingIdRef.current) {
        supabase
          .from("transcript_segments")
          .insert({
            meeting_id: meetingIdRef.current,
            speaker: newTurn.speaker,
            text: newTurn.text,
            start_ms: newTurn.startMs,
            end_ms: newTurn.endMs,
            confidence: newTurn.confidence,
            is_streaming_result: true,
          })
          .then(({ error }) => {
            if (error) {
              console.warn(`${LOG_PREFIX} Failed to save segment:`, error);
            }
          });
      }
    }
  }, [generateTurnId]);

  /**
   * Handle WebSocket message from AssemblyAI v3
   */
  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    try {
      const message: AssemblyAIV3Message = JSON.parse(event.data);

      // Check for error
      if ("error" in message) {
        console.error(`${LOG_PREFIX} AssemblyAI error:`, message.error);
        setError(message.error);
        return;
      }

      // Handle v3 message types
      switch (message.type) {
        case "Begin":
          const beginMsg = message as AssemblyAIV3Begin;
          console.log(`${LOG_PREFIX} Session started:`, beginMsg.id);
          setSessionId(beginMsg.id);
          setIsConnected(true);
          setIsConnecting(false);
          break;

        case "Turn":
          processTurnMessage(message as AssemblyAIV3Turn);
          break;

        case "Termination":
          const termMsg = message as AssemblyAIV3Termination;
          console.log(`${LOG_PREFIX} Session terminated:`, {
            audio_duration: termMsg.audio_duration_seconds,
            session_duration: termMsg.session_duration_seconds,
          });
          setIsConnected(false);
          break;

        default:
          console.log(`${LOG_PREFIX} Unknown message type:`, message);
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Error parsing message:`, err);
    }
  }, [processTurnMessage]);

  /**
   * Connect to AssemblyAI v3 WebSocket
   */
  const connectWebSocket = useCallback(async (token: string): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      // Build v3 WebSocket URL with token in query params
      const wsUrl = `${WS_URL}?sample_rate=${SAMPLE_RATE}&token=${encodeURIComponent(token)}`;
      console.log(`${LOG_PREFIX} Connecting to AssemblyAI v3...`);
      console.log(`${LOG_PREFIX} URL: ${WS_URL}?sample_rate=${SAMPLE_RATE}&token=***`);
      
      setIsConnecting(true);
      const ws = new WebSocket(wsUrl);
      
      // v3 uses binary mode for audio
      ws.binaryType = 'arraybuffer';

      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          reject(new Error("WebSocket connection timeout"));
        }
      }, 15000);

      ws.onopen = () => {
        console.log(`${LOG_PREFIX} WebSocket opened`);
        // v3: No auth message needed - token is in URL
        // Connection is authenticated immediately
      };

      ws.onmessage = (event) => {
        // Check if this is the Begin message
        try {
          const message = JSON.parse(event.data);
          if (message.type === "Begin") {
            clearTimeout(connectionTimeout);
            console.log(`${LOG_PREFIX} Received Begin, session ready`);
            resolve(ws);
          }
        } catch {
          // Ignore parse errors for binary data
        }
        // Also handle all messages normally
        handleWebSocketMessage(event);
      };

      ws.onerror = (err) => {
        console.error(`${LOG_PREFIX} WebSocket error:`, err);
        clearTimeout(connectionTimeout);
        setIsConnecting(false);
        reject(new Error("WebSocket connection failed"));
      };

      ws.onclose = (event) => {
        console.log(`${LOG_PREFIX} WebSocket closed:`, event.code, event.reason);
        clearTimeout(connectionTimeout);
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;
      };
    });
  }, [handleWebSocketMessage]);

  /**
   * Handle incoming audio data from LiveAudioStream
   */
  const handleAudioData = useCallback((data: string) => {
    // data is base64 encoded PCM audio
    if (!isStreamingRef.current || isPaused) return;
    
    // Save audio chunk for post-recording batch processing (speaker diarization)
    audioChunksRef.current.push(data);
    
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // v3 API: Send raw binary audio, not JSON
      try {
        const audioBuffer = base64ToArrayBuffer(data);
        ws.send(audioBuffer);
      } catch (err) {
        console.error(`${LOG_PREFIX} Error sending audio:`, err);
      }
    }
  }, [isPaused]);

  /**
   * Upload audio and trigger batch processing for speaker diarization
   */
  const uploadAudioAndTriggerProcessing = useCallback(async (meetingId: string, userId: string): Promise<void> => {
    const chunks = audioChunksRef.current;
    
    if (chunks.length === 0) {
      console.log(`${LOG_PREFIX} No audio chunks to upload`);
      return;
    }
    
    console.log(`${LOG_PREFIX} ========================================`);
    console.log(`${LOG_PREFIX} Starting post-recording batch processing`);
    console.log(`${LOG_PREFIX} Chunks collected: ${chunks.length}`);
    console.log(`${LOG_PREFIX} ========================================`);
    
    try {
      // 1. Save audio chunks to WAV file on device using new File API
      console.log(`${LOG_PREFIX} Saving audio chunks to WAV file...`);
      const wavFile = await saveAudioChunksToWavFile(chunks, meetingId);
      
      // 2. Read the file bytes directly using new File API
      const audioBytes = await wavFile.bytes();
      
      // 3. Upload to Supabase Storage
      const audioPath = `${userId}/${meetingId}/recording.wav`;
      console.log(`${LOG_PREFIX} Uploading to: ${audioPath} (${audioBytes.length} bytes)`);
      
      const { error: uploadError } = await supabase.storage
        .from('meeting-audio')
        .upload(audioPath, audioBytes.buffer, {
          contentType: 'audio/wav',
          upsert: true,
        });
      
      if (uploadError) {
        console.error(`${LOG_PREFIX} Upload error:`, uploadError);
        throw new Error(`Failed to upload audio: ${uploadError.message}`);
      }
      
      console.log(`${LOG_PREFIX} Audio uploaded successfully`);
      
      // Clean up local file using new File API
      try {
        wavFile.delete();
      } catch (cleanupError) {
        console.warn(`${LOG_PREFIX} Failed to clean up local file:`, cleanupError);
      }
      
      // 3. Update meeting with audio path and queue for processing
      const { error: updateError } = await supabase
        .from('meetings')
        .update({
          raw_audio_path: audioPath,
          raw_audio_format: 'wav',
          status: 'queued',
        })
        .eq('id', meetingId);
      
      if (updateError) {
        console.error(`${LOG_PREFIX} Update error:`, updateError);
        throw new Error(`Failed to update meeting: ${updateError.message}`);
      }
      
      console.log(`${LOG_PREFIX} Meeting updated, triggering batch processing...`);
      
      // 4. Trigger batch processing edge function
      const { error: fnError } = await supabase.functions.invoke('process-recording', {
        body: { meeting_id: meetingId },
      });
      
      if (fnError) {
        console.error(`${LOG_PREFIX} Edge function error:`, fnError);
        // Don't throw - the meeting is queued, processing can be retried
        console.warn(`${LOG_PREFIX} Batch processing will be retried`);
      } else {
        console.log(`${LOG_PREFIX} Batch processing triggered successfully`);
      }
      
    } catch (err) {
      console.error(`${LOG_PREFIX} Upload/processing error:`, err);
      // Update meeting status to indicate error but keep streaming transcript
      await supabase
        .from('meetings')
        .update({
          error_message: `Speaker detection failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
        .eq('id', meetingId);
    }
  }, []);

  /**
   * Start recording session
   */
  const startRecording = useCallback(async (meetingId: string): Promise<void> => {
    console.log(`${LOG_PREFIX} ========================================`);
    console.log(`${LOG_PREFIX} startRecording CALLED (v3 API)`);
    console.log(`${LOG_PREFIX} Meeting ID: ${meetingId}`);
    console.log(`${LOG_PREFIX} ========================================`);
    
    try {
      setError(null);
      meetingIdRef.current = meetingId;
      audioChunksRef.current = []; // Clear any previous chunks
      
      // Get current user ID for storage path
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        userIdRef.current = user.id;
      }

      // Step 1: Check/request permission
      console.log(`${LOG_PREFIX} Step 1: Checking microphone permission...`);
      if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) {
          throw new Error("Microphone permission required");
        }
      }

      // Step 2: Get AssemblyAI token
      console.log(`${LOG_PREFIX} Step 2: Getting AssemblyAI token...`);
      const token = await getAssemblyAIToken();

      // Step 3: Connect to WebSocket
      console.log(`${LOG_PREFIX} Step 3: Connecting to v3 WebSocket...`);
      const ws = await connectWebSocket(token);
      wsRef.current = ws;

      // Step 4: Initialize audio stream
      console.log(`${LOG_PREFIX} Step 4: Initializing LiveAudioStream...`);
      LiveAudioStream.init(LIVE_AUDIO_CONFIG);
      
      // Set up audio data handler
      LiveAudioStream.on("data", handleAudioData);

      // Step 5: Start streaming
      console.log(`${LOG_PREFIX} Step 5: Starting audio stream...`);
      isStreamingRef.current = true;
      LiveAudioStream.start();
      
      setIsRecording(true);
      setDurationMs(0);

      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        setDurationMs((prev) => prev + 100);
      }, 100);

      console.log(`${LOG_PREFIX} Recording started successfully (v3 API)`);
    } catch (err) {
      console.error(`${LOG_PREFIX} startRecording FAILED:`, err);
      setError(err instanceof Error ? err.message : "Failed to start recording");
      throw err;
    }
  }, [hasPermission, requestPermission, getAssemblyAIToken, connectWebSocket, handleAudioData]);

  /**
   * Stop recording session
   */
  const stopRecording = useCallback(async (): Promise<void> => {
    console.log(`${LOG_PREFIX} Stopping recording...`);
    
    isStreamingRef.current = false;
    
    const currentMeetingId = meetingIdRef.current;
    const currentUserId = userIdRef.current;
    const currentDurationMs = durationMs;

    // Stop duration timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Stop audio stream
    try {
      LiveAudioStream.stop();
    } catch (err) {
      console.warn(`${LOG_PREFIX} Error stopping audio stream:`, err);
    }

    // Close WebSocket
    const ws = wsRef.current;
    if (ws) {
      try {
        // v3: Send Terminate message to gracefully close
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "Terminate" }));
        }
        // Give it a moment to process, then close
        setTimeout(() => {
          ws.close();
        }, 500);
      } catch (err) {
        console.warn(`${LOG_PREFIX} Error closing WebSocket:`, err);
      }
      wsRef.current = null;
    }

    // Update meeting with duration and streaming flag
    // Status will be updated to 'queued' when we trigger batch processing
    if (currentMeetingId) {
      const durationSeconds = Math.round(currentDurationMs / 1000);
      await supabase
        .from("meetings")
        .update({
          duration_seconds: durationSeconds,
          used_streaming_transcription: true,
          // Keep status as 'uploading' until batch processing starts
          // This will show "Speaker detection in progress" banner
        })
        .eq("id", currentMeetingId);
      
      // Trigger batch processing for speaker diarization (async, don't await)
      // This happens in the background while user sees the streaming transcript
      if (currentUserId) {
        console.log(`${LOG_PREFIX} Initiating background batch processing for speaker diarization...`);
        uploadAudioAndTriggerProcessing(currentMeetingId, currentUserId);
      } else {
        console.warn(`${LOG_PREFIX} No user ID available, skipping batch processing`);
        // Mark as ready since we can't do batch processing
        await supabase
          .from("meetings")
          .update({ status: "ready" })
          .eq("id", currentMeetingId);
      }
    }

    setIsRecording(false);
    setIsPaused(false);
    setIsConnected(false);
    setSessionId(null);
    meetingIdRef.current = null;
    userIdRef.current = null;

    console.log(`${LOG_PREFIX} Recording stopped, batch processing initiated`);
  }, [durationMs, uploadAudioAndTriggerProcessing]);

  /**
   * Pause recording
   */
  const pauseRecording = useCallback((): void => {
    console.log(`${LOG_PREFIX} Pausing...`);
    setIsPaused(true);
    
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  /**
   * Resume recording
   */
  const resumeRecording = useCallback((): void => {
    console.log(`${LOG_PREFIX} Resuming...`);
    setIsPaused(false);
    
    durationIntervalRef.current = setInterval(() => {
      setDurationMs((prev) => prev + 100);
    }, 100);
  }, []);

  /**
   * Clear transcript data
   */
  const clearTranscript = useCallback((): void => {
    setTurns([]);
    setCurrentPartial("");
    turnCounterRef.current = 0;
    currentTurnRef.current = "";
    setError(null);
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      isStreamingRef.current = false;
      
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }

      try {
        LiveAudioStream.stop();
      } catch {
        // Ignore
      }

      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    // State
    isRecording,
    isPaused,
    durationMs,
    isConnected,
    isConnecting,
    sessionId,
    turns,
    currentPartial,
    hasPermission,
    error,

    // Actions
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearTranscript,
  };
}

export default useLiveAudioStream;
