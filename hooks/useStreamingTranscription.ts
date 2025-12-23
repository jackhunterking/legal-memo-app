/**
 * useStreamingTranscription Hook
 * 
 * Manages streaming transcription state for real-time display.
 * Works with useChunkedRecording to accumulate and display transcripts.
 * 
 * Per AssemblyAI Streaming API v3:
 * - PartialTranscript: Interim results that may change (shown with animation)
 * - FinalTranscript: Immutable final results (stored permanently)
 * 
 * @see Plan: AssemblyAI Streaming API v3 section
 */

import { useState, useCallback, useRef } from "react";
import type { ChunkResult, StreamingSegment } from "./useChunkedRecording";

/**
 * Transcript turn representing a final transcript segment
 * Maps to AssemblyAI FinalTranscript message structure
 */
export interface TranscriptTurn {
  id: string;
  speaker: string;
  text: string;
  startMs: number;    // audio_start from AssemblyAI
  endMs: number;      // audio_end from AssemblyAI
  confidence: number;
  isFinal: boolean;
}

/**
 * State for streaming transcription
 */
export interface StreamingTranscriptionState {
  // Connection state
  isConnected: boolean;
  sessionId: string | null;
  
  // Transcript data
  turns: TranscriptTurn[];        // Accumulated FinalTranscript results
  currentPartial: string;          // Latest PartialTranscript text
  fullText: string;                // Concatenated text from all turns
  
  // Statistics
  totalSegments: number;
  
  // Error state
  error: string | null;
}

/**
 * Actions for streaming transcription
 */
export interface StreamingTranscriptionActions {
  setConnected: (connected: boolean, sessionId?: string | null) => void;
  processChunkResult: (result: ChunkResult) => void;
  clearTranscript: () => void;
  setError: (error: string | null) => void;
}

/**
 * Return type for the hook
 */
export type UseStreamingTranscriptionReturn = StreamingTranscriptionState & StreamingTranscriptionActions;

/**
 * Custom hook for managing streaming transcription state
 */
export function useStreamingTranscription(): UseStreamingTranscriptionReturn {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  // Transcript state
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [currentPartial, setCurrentPartial] = useState("");
  const [error, setErrorState] = useState<string | null>(null);
  
  // Turn ID counter
  const turnCounterRef = useRef(0);

  /**
   * Generate unique turn ID
   */
  const generateTurnId = useCallback((): string => {
    turnCounterRef.current += 1;
    return `turn-${Date.now()}-${turnCounterRef.current}`;
  }, []);

  /**
   * Set connection state
   */
  const setConnected = useCallback((connected: boolean, sessId?: string | null): void => {
    setIsConnected(connected);
    if (sessId !== undefined) {
      setSessionId(sessId);
    }
    if (!connected) {
      setSessionId(null);
    }
  }, []);

  /**
   * Process a chunk result from useChunkedRecording
   * Updates partial text and accumulates final segments
   */
  const processChunkResult = useCallback((result: ChunkResult): void => {
    // Update partial text (PartialTranscript from AssemblyAI)
    setCurrentPartial(result.partialText);

    // Process final segments (FinalTranscript from AssemblyAI)
    if (result.finalSegments.length > 0) {
      const newTurns: TranscriptTurn[] = result.finalSegments.map((segment) => ({
        id: generateTurnId(),
        speaker: segment.speaker,
        text: segment.text,
        startMs: segment.startMs,
        endMs: segment.endMs,
        confidence: segment.confidence,
        isFinal: true,
      }));

      setTurns((prevTurns) => {
        // Check if we should merge with the last turn (same speaker, close timing)
        const merged: TranscriptTurn[] = [...prevTurns];
        
        for (const newTurn of newTurns) {
          const lastTurn = merged[merged.length - 1];
          
          // Merge if same speaker and within 2 seconds
          if (
            lastTurn &&
            lastTurn.speaker === newTurn.speaker &&
            newTurn.startMs - lastTurn.endMs < 2000
          ) {
            // Merge with previous turn
            merged[merged.length - 1] = {
              ...lastTurn,
              text: `${lastTurn.text} ${newTurn.text}`,
              endMs: newTurn.endMs,
              confidence: (lastTurn.confidence + newTurn.confidence) / 2,
            };
          } else {
            // Add as new turn
            merged.push(newTurn);
          }
        }

        return merged;
      });

      // Clear partial text after receiving final
      setCurrentPartial("");
    }
  }, [generateTurnId]);

  /**
   * Clear all transcript data
   */
  const clearTranscript = useCallback((): void => {
    setTurns([]);
    setCurrentPartial("");
    turnCounterRef.current = 0;
    setErrorState(null);
  }, []);

  /**
   * Set error state
   */
  const setError = useCallback((err: string | null): void => {
    setErrorState(err);
  }, []);

  // Compute derived state
  const fullText = turns.map((t) => t.text).join(" ");
  const totalSegments = turns.length;

  return {
    // State
    isConnected,
    sessionId,
    turns,
    currentPartial,
    fullText,
    totalSegments,
    error,

    // Actions
    setConnected,
    processChunkResult,
    clearTranscript,
    setError,
  };
}

export default useStreamingTranscription;
