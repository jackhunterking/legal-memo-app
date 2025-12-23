/**
 * Recording Screen
 * 
 * Main recording interface with real-time streaming transcription.
 * Integrates chunked audio recording with live transcript display.
 * 
 * Uses:
 * - useChunkedRecording: Manages audio recording in chunks
 * - useStreamingTranscription: Manages transcript state
 * - LiveTranscript: Displays real-time transcription
 * 
 * Per Expo Audio docs:
 * - Requests permissions via AudioModule.requestRecordingPermissionsAsync()
 * - Configures audio mode via setAudioModeAsync()
 * - Uses useAudioRecorder for recording
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  Animated,
  BackHandler,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Pause, Play, Square, Mic, Wifi, WifiOff } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system";
import { useMeetings } from "@/contexts/MeetingContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { useChunkedRecording, type ChunkResult } from "@/hooks/useChunkedRecording";
import { useStreamingTranscription } from "@/hooks/useStreamingTranscription";
import LiveTranscript from "@/components/LiveTranscript";
import { AUDIO_FILE_CONFIG } from "@/lib/audio-config";

export default function RecordingScreen() {
  const router = useRouter();
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const { uploadAudio, updateMeeting } = useMeetings();
  const { user } = useAuth();

  // Local state
  const [isUploading, setIsUploading] = useState(false);
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [totalDurationMs, setTotalDurationMs] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Animation refs
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hasInitialized = useRef(false);

  // Streaming transcription state
  const {
    isConnected,
    turns,
    currentPartial,
    processChunkResult,
    setConnected,
    setError: setTranscriptError,
    clearTranscript,
  } = useStreamingTranscription();

  // Handle chunk processed callback
  const handleChunkProcessed = useCallback((result: ChunkResult) => {
    processChunkResult(result);
  }, [processChunkResult]);

  // Chunked recording hook
  const {
    isRecording,
    durationMillis,
    hasPermission,
    isInitialized,
    sessionId,
    chunkIndex,
    isProcessingChunk,
    error: recordingError,
    totalChunksProcessed,
    startSession,
    stopSession,
    pauseRecording,
    resumeRecording,
  } = useChunkedRecording(handleChunkProcessed);

  // Update connection state when session changes
  useEffect(() => {
    setConnected(!!sessionId, sessionId);
  }, [sessionId, setConnected]);

  // Track total duration across pause/resume
  useEffect(() => {
    if (isRecording && !isPaused) {
      const interval = setInterval(() => {
        setTotalDurationMs((prev) => prev + 100);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isRecording, isPaused]);

  // Initialize recording on mount
  useEffect(() => {
    if (hasInitialized.current || !meetingId) return;
    hasInitialized.current = true;

    const initializeRecording = async () => {
      try {
        console.log("[Recording] Initializing...");
        setRecordedAt(new Date().toISOString());
        
        // Start recording session
        await startSession(meetingId);
        
        console.log("[Recording] Recording started successfully");
      } catch (err) {
        console.error("[Recording] Init error:", err);
        
        if (Platform.OS !== "web") {
          Alert.alert(
            "Recording Error",
            err instanceof Error ? err.message : "Failed to initialize recording"
          );
        }
        router.back();
      }
    };

    initializeRecording();
  }, [meetingId, startSession, router]);

  // Pulse animation
  useEffect(() => {
    if (isRecording && !isPaused && !isUploading) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [isRecording, isPaused, isUploading, pulseAnim]);

  // Handle back button - show confirmation
  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isRecording || sessionId) {
        handleStop();
        return true;
      }
      return false;
    });

    return () => backHandler.remove();
  }, [isRecording, sessionId]);

  // Handle pause/resume
  const handlePauseResume = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      if (isPaused) {
        resumeRecording();
        setIsPaused(false);
      } else {
        pauseRecording();
        setIsPaused(true);
      }
    } catch (err) {
      console.error("[Recording] Pause/Resume error:", err);
    }
  };

  // Handle stop recording
  const handleStop = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }

    const confirmStop = () => {
      performStop();
    };

    if (Platform.OS === "web") {
      confirmStop();
    } else {
      Alert.alert(
        "Stop Recording",
        "Are you sure you want to stop the recording? Your transcription will be saved.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Stop & Save", style: "destructive", onPress: confirmStop },
        ]
      );
    }
  };

  // Perform stop and upload
  const performStop = async () => {
    if (!meetingId || !user?.id) return;

    setIsUploading(true);

    try {
      // Stop recording session
      console.log("[Recording] Stopping session...");
      await stopSession();

      // Calculate duration
      const durationSeconds = Math.round(totalDurationMs / 1000);
      console.log("[Recording] Duration:", durationSeconds, "seconds");

      // Update meeting with recording info
      await updateMeeting({
        meetingId,
        updates: {
          duration_seconds: durationSeconds,
          recorded_at: recordedAt || new Date().toISOString(),
          used_streaming_transcription: true,
          status: "ready", // Mark as ready since we have streaming transcripts
        },
      });

      // Navigate to meeting detail
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      router.replace(`/meeting/${meetingId}`);
    } catch (err) {
      console.error("[Recording] Stop/save error:", err);
      setIsUploading(false);

      // Update meeting status to failed
      try {
        await updateMeeting({
          meetingId,
          updates: {
            status: "failed",
            error_message: err instanceof Error ? err.message : "Save failed",
          },
        });
      } catch (updateErr) {
        console.error("[Recording] Failed to update meeting status:", updateErr);
      }

      if (Platform.OS !== "web") {
        Alert.alert(
          "Save Error",
          err instanceof Error ? err.message : "Failed to save recording"
        );
      }
    }
  };

  // Format time display
  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Get status text
  const getStatusText = () => {
    if (isUploading) return "Saving...";
    if (isPaused) return "Paused";
    if (isProcessingChunk) return "Processing...";
    if (isRecording) return "Recording";
    return "Initializing...";
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Recording Indicator */}
        <View style={styles.recordingIndicator}>
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: pulseAnim }],
                opacity: isPaused ? 0.3 : 0.6,
              },
            ]}
          />
          <View style={[styles.recordingDot, isPaused && styles.recordingDotPaused]}>
            <Mic size={32} color={Colors.text} />
          </View>
        </View>

        {/* Status and Timer */}
        <Text style={styles.statusText}>{getStatusText()}</Text>
        <Text style={styles.timer}>{formatTime(totalDurationMs)}</Text>

        {/* Connection Status */}
        <View style={styles.connectionStatus}>
          {isConnected ? (
            <>
              <Wifi size={16} color="#10B981" />
              <Text style={[styles.connectionText, { color: "#10B981" }]}>
                Live Transcription Active
              </Text>
            </>
          ) : (
            <>
              <WifiOff size={16} color={Colors.textMuted} />
              <Text style={[styles.connectionText, { color: Colors.textMuted }]}>
                Connecting...
              </Text>
            </>
          )}
          {totalChunksProcessed > 0 && (
            <Text style={styles.chunkCount}>
              {totalChunksProcessed} chunks
            </Text>
          )}
        </View>

        {/* Error Display */}
        {recordingError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{recordingError}</Text>
          </View>
        )}

        {/* Live Transcript */}
        <View style={styles.transcriptContainer}>
          <LiveTranscript
            turns={turns}
            currentPartial={currentPartial}
            isConnected={isConnected}
          />
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <Pressable
            style={[styles.controlButton, styles.pauseButton]}
            onPress={handlePauseResume}
            disabled={isUploading || !isInitialized}
          >
            {isPaused ? (
              <Play size={28} color={Colors.text} fill={Colors.text} />
            ) : (
              <Pause size={28} color={Colors.text} fill={Colors.text} />
            )}
          </Pressable>

          <Pressable
            style={[styles.controlButton, styles.stopButton]}
            onPress={handleStop}
            disabled={isUploading}
          >
            <Square size={32} color={Colors.text} fill={Colors.text} />
          </Pressable>
        </View>

        <Text style={styles.hint}>
          {isPaused ? "Tap play to resume" : "Tap stop when finished"}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  recordingIndicator: {
    marginBottom: 20,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.recording,
  },
  recordingDot: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.recording,
    justifyContent: "center",
    alignItems: "center",
  },
  recordingDotPaused: {
    backgroundColor: Colors.surfaceLight,
  },
  statusText: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 8,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  timer: {
    fontSize: 48,
    fontWeight: "200",
    color: Colors.text,
    fontVariant: ["tabular-nums"],
    marginBottom: 16,
    letterSpacing: -1,
    textAlign: "center",
  },
  connectionStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    gap: 8,
  },
  connectionText: {
    fontSize: 13,
    fontWeight: "500",
  },
  chunkCount: {
    fontSize: 12,
    color: Colors.textMuted,
    marginLeft: 8,
  },
  errorBanner: {
    backgroundColor: `${Colors.error}20`,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    textAlign: "center",
  },
  transcriptContainer: {
    flex: 1,
    marginBottom: 20,
    minHeight: 150,
    maxHeight: 300,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
    marginBottom: 16,
  },
  controlButton: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 40,
  },
  pauseButton: {
    width: 64,
    height: 64,
    backgroundColor: Colors.surfaceLight,
  },
  stopButton: {
    width: 72,
    height: 72,
    backgroundColor: Colors.recording,
  },
  hint: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    marginBottom: 20,
  },
});
