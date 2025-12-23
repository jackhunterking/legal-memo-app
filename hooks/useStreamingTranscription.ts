/**
 * useStreamingTranscription Hook
 * 
 * React hook for managing real-time streaming transcription with AssemblyAI.
 * Handles connection lifecycle, transcript accumulation, and speaker turns.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  AssemblyAIStreamingClient,
  AssemblyAITranscriptMessage,
  createStreamingClient,
} from "@/lib/assemblyai-streaming";

// Transcript turn with speaker diarization
export interface TranscriptTurn {
  id: string;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  isFinal: boolean;
}

// Hook return type
export interface UseStreamingTranscriptionReturn {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  sessionId: string | null;
  error: string | null;

  // Transcript data
  turns: TranscriptTurn[];
  currentPartial: string;
  fullText: string;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  sendAudioData: (base64Audio: string) => void;
  sendAudioBuffer: (buffer: Float32Array | Int16Array) => void;
  clearTranscript: () => void;
}

/**
 * Hook for managing streaming transcription
 */
export function useStreamingTranscription(): UseStreamingTranscriptionReturn {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Transcript state
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [currentPartial, setCurrentPartial] = useState("");

  // Client reference
  const clientRef = useRef<AssemblyAIStreamingClient | null>(null);
  const turnCounterRef = useRef(0);

  // Generate unique turn ID
  const generateTurnId = useCallback(() => {
    turnCounterRef.current += 1;
    return `turn-${Date.now()}-${turnCounterRef.current}`;
  }, []);

  // Determine speaker from words or track
  const determineSpeaker = useCallback((message: AssemblyAITranscriptMessage): string => {
    // Check if any words have speaker labels
    if (message.words && message.words.length > 0) {
      const speakerWord = message.words.find(w => w.speaker);
      if (speakerWord?.speaker) {
        return speakerWord.speaker;
      }
    }
    
    // Default speaker assignment based on audio timing
    // This is a simple heuristic - AssemblyAI's speaker labels are more accurate
    return "Speaker A";
  }, []);

  // Handle partial transcript
  const handlePartialTranscript = useCallback((message: AssemblyAITranscriptMessage) => {
    setCurrentPartial(message.text);
  }, []);

  // Handle final transcript
  const handleFinalTranscript = useCallback((message: AssemblyAITranscriptMessage) => {
    const speaker = determineSpeaker(message);
    
    const newTurn: TranscriptTurn = {
      id: generateTurnId(),
      speaker,
      text: message.text,
      startTime: message.audio_start,
      endTime: message.audio_end,
      confidence: message.confidence,
      isFinal: true,
    };

    setTurns(prev => {
      // Check if we should merge with previous turn (same speaker, close timing)
      const lastTurn = prev[prev.length - 1];
      if (
        lastTurn &&
        lastTurn.speaker === speaker &&
        message.audio_start - lastTurn.endTime < 2000 // Less than 2 seconds gap
      ) {
        // Merge with previous turn
        return [
          ...prev.slice(0, -1),
          {
            ...lastTurn,
            text: `${lastTurn.text} ${message.text}`,
            endTime: message.audio_end,
            confidence: (lastTurn.confidence + message.confidence) / 2,
          },
        ];
      }

      return [...prev, newTurn];
    });

    // Clear partial after final
    setCurrentPartial("");
  }, [determineSpeaker, generateTurnId]);

  // Handle session start
  const handleSessionStart = useCallback((newSessionId: string) => {
    setSessionId(newSessionId);
    setIsConnected(true);
    setIsConnecting(false);
    setError(null);
  }, []);

  // Handle error
  const handleError = useCallback((errorMsg: string) => {
    console.error("[useStreamingTranscription] Error:", errorMsg);
    setError(errorMsg);
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    setIsConnected(false);
    setSessionId(null);
  }, []);

  // Connect to streaming service
  const connect = useCallback(async () => {
    if (isConnected || isConnecting) {
      console.log("[useStreamingTranscription] Already connected or connecting");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Create new client with handlers
      const client = createStreamingClient({
        onSessionStart: handleSessionStart,
        onPartialTranscript: handlePartialTranscript,
        onFinalTranscript: handleFinalTranscript,
        onError: handleError,
        onClose: handleClose,
      });

      clientRef.current = client;

      await client.connect();
      console.log("[useStreamingTranscription] Connected successfully");
    } catch (err) {
      console.error("[useStreamingTranscription] Connection failed:", err);
      setIsConnecting(false);
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  }, [
    isConnected,
    isConnecting,
    handleSessionStart,
    handlePartialTranscript,
    handleFinalTranscript,
    handleError,
    handleClose,
  ]);

  // Disconnect from streaming service
  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setSessionId(null);
  }, []);

  // Send audio data (base64 encoded)
  const sendAudioData = useCallback((base64Audio: string) => {
    if (clientRef.current?.isConnected) {
      clientRef.current.sendAudio(base64Audio);
    }
  }, []);

  // Send audio buffer
  const sendAudioBuffer = useCallback((buffer: Float32Array | Int16Array) => {
    if (clientRef.current?.isConnected) {
      clientRef.current.sendAudioBuffer(buffer);
    }
  }, []);

  // Clear transcript
  const clearTranscript = useCallback(() => {
    setTurns([]);
    setCurrentPartial("");
    turnCounterRef.current = 0;
  }, []);

  // Compute full text from turns
  const fullText = turns.map(t => t.text).join(" ");

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, []);

  return {
    // Connection state
    isConnected,
    isConnecting,
    sessionId,
    error,

    // Transcript data
    turns,
    currentPartial,
    fullText,

    // Actions
    connect,
    disconnect,
    sendAudioData,
    sendAudioBuffer,
    clearTranscript,
  };
}

export default useStreamingTranscription;

