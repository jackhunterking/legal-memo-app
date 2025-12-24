/**
 * Recording Screen
 * 
 * Clean, user-focused recording interface with real-time live transcription.
 * Displays transcription like a teleprompter - words appear as you speak.
 * 
 * Features:
 * - Continuous recording (never interrupts)
 * - Real-time transcription display
 * - Simple controls (pause/stop)
 * - No technical details shown to user
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
import { Pause, Play, Square, Mic } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetings } from "@/contexts/MeetingContext";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { useLiveAudioStream } from "@/hooks/useLiveAudioStream";
import LiveTranscript from "@/components/LiveTranscript";

export default function RecordingScreen() {
  const router = useRouter();
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const { updateMeeting } = useMeetings();
  const { user } = useAuth();

  // Local state
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Animation ref for pulsing recording indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hasInitialized = useRef(false);

  // Live audio streaming with real-time transcription
  const {
    isRecording,
    isPaused,
    durationMs,
    isConnected,
    isConnecting,
    turns,
    currentPartial,
    error: streamError,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  } = useLiveAudioStream();

  // Initialize recording on mount
  useEffect(() => {
    if (hasInitialized.current || !meetingId) return;
    hasInitialized.current = true;

    const initializeRecording = async () => {
      try {
        console.log("[Recording] Initializing...");
        
        // Verify user is authenticated
        if (!user?.id) {
          throw new Error("Please log in to start recording");
        }
        
        setRecordedAt(new Date().toISOString());
        
        // Start live streaming recording
        await startRecording(meetingId);
        
        console.log("[Recording] Recording started successfully");
      } catch (err) {
        console.error("[Recording] Init error:", err);
        
        const errorMessage = err instanceof Error ? err.message : "Failed to initialize recording";
        
        if (Platform.OS !== "web") {
          Alert.alert(
            "Recording Error",
            errorMessage,
            [{ text: "OK", onPress: () => router.back() }]
          );
        } else {
          router.back();
        }
      }
    };

    initializeRecording();
  }, [meetingId, user, startRecording, router]);

  // Pulse animation for recording indicator
  useEffect(() => {
    if (isRecording && !isPaused && !isSaving) {
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
  }, [isRecording, isPaused, isSaving, pulseAnim]);

  // Handle back button - show confirmation
  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isRecording) {
        handleStop();
        return true;
      }
      return false;
    });

    return () => backHandler.remove();
  }, [isRecording]);

  // Handle pause/resume
  const handlePauseResume = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
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
        "Are you sure you want to stop? Your transcription will be saved.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Stop & Save", style: "destructive", onPress: confirmStop },
        ]
      );
    }
  };

  // Perform stop and save
  const performStop = async () => {
    if (!meetingId || !user?.id) return;

    setIsSaving(true);

    try {
      // Stop recording - this also:
      // 1. Saves segments to database
      // 2. Uploads audio file to storage
      // 3. Triggers batch processing for speaker diarization
      // 4. Updates meeting status appropriately
      await stopRecording();

      // Calculate duration
      const durationSeconds = Math.round(durationMs / 1000);
      console.log("[Recording] Duration:", durationSeconds, "seconds");

      // Update meeting with recording timestamp only
      // Note: Don't set status here - the hook handles status based on batch processing
      await updateMeeting({
        meetingId,
        updates: {
          recorded_at: recordedAt || new Date().toISOString(),
        },
      });

      // Navigate to meeting detail
      // User will see transcript immediately with "Speaker detection in progress" banner
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      router.replace(`/meeting/${meetingId}`);
    } catch (err) {
      console.error("[Recording] Stop/save error:", err);
      setIsSaving(false);

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

  // Get simple status text
  const getStatusText = () => {
    if (isSaving) return "Saving...";
    if (isPaused) return "Paused";
    if (isConnecting) return "Connecting...";
    if (isRecording) return "Recording";
    return "Starting...";
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
        <Text style={styles.timer}>{formatTime(durationMs)}</Text>

        {/* Connection indicator (subtle) */}
        {isConnected && (
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}

        {/* Error Display (only if critical) */}
        {streamError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{streamError}</Text>
          </View>
        )}

        {/* Live Transcript - Teleprompter View */}
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
            disabled={isSaving || !isRecording}
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
            disabled={isSaving}
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
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 16,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  liveText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#10B981",
    letterSpacing: 1,
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
    minHeight: 200,
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
