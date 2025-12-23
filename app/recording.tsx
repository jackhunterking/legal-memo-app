import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  Animated,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Pause, Play, Square, Mic } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system";
import { useMeetings } from "@/contexts/MeetingContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { useStreamingTranscription, TranscriptTurn } from "@/hooks/useStreamingTranscription";
import LiveTranscript from "@/components/LiveTranscript";

export default function RecordingScreen() {
  const router = useRouter();
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const { uploadAudio, updateMeeting } = useMeetings();
  const { user } = useAuth();

  const [isUploading, setIsUploading] = useState(false);
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hasStartedRef = useRef(false);

  // expo-audio recorder hook
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  // Streaming transcription hook
  const {
    isConnected: isStreamingConnected,
    turns: transcriptTurns,
    currentPartial,
    connect: connectStreaming,
    disconnect: disconnectStreaming,
  } = useStreamingTranscription();

  // Request permissions and initialize
  const initializeRecording = useCallback(async () => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    try {
      console.log("[Recording] Requesting permissions...");
      const status = await AudioModule.requestRecordingPermissionsAsync();
      console.log("[Recording] Permission status:", status.granted);

      if (!status.granted) {
        throw new Error(
          "Microphone permission denied. Please grant microphone access in your device settings."
        );
      }

      setHasPermission(true);

      console.log("[Recording] Setting audio mode...");
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      setIsInitialized(true);
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
  }, [router]);

  // Start recording after initialization
  const startRecording = useCallback(async () => {
    if (!isInitialized || recorderState.isRecording) return;

    try {
      console.log("[Recording] Preparing to record...");
      await audioRecorder.prepareToRecordAsync();
      
      console.log("[Recording] Starting recording...");
      audioRecorder.record();
      setRecordedAt(new Date().toISOString());

      // Connect to streaming transcription
      console.log("[Recording] Connecting to streaming transcription...");
      await connectStreaming();

      console.log("[Recording] Started successfully!");
    } catch (err) {
      console.error("[Recording] Start error:", err);
      if (Platform.OS !== "web") {
        Alert.alert(
          "Recording Error",
          err instanceof Error ? err.message : "Failed to start recording"
        );
      }
    }
  }, [isInitialized, recorderState.isRecording, audioRecorder, connectStreaming]);

  // Initialize on mount
  useEffect(() => {
    initializeRecording();
  }, [initializeRecording]);

  // Start recording when initialized
  useEffect(() => {
    if (isInitialized && hasPermission && !recorderState.isRecording) {
      startRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, hasPermission, startRecording]);

  // Pulse animation
  useEffect(() => {
    if (recorderState.isRecording && !isUploading) {
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
  }, [recorderState.isRecording, isUploading, pulseAnim]);

  const handlePauseResume = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      if (recorderState.isRecording) {
        await audioRecorder.pause();
      } else {
        audioRecorder.record();
      }
    } catch (err) {
      console.error("[Recording] Pause/Resume error:", err);
    }
  };

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
        "Are you sure you want to stop the recording?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Stop", style: "destructive", onPress: confirmStop },
        ]
      );
    }
  };

  const performStop = async () => {
    if (!meetingId || !user?.id) return;

    setIsUploading(true);

    try {
      // Get duration before stopping
      const durationMillis = recorderState.durationMillis || 0;
      console.log("[Recording] Duration before stop:", durationMillis, "ms");

      // Disconnect streaming transcription
      console.log("[Recording] Disconnecting streaming...");
      disconnectStreaming();

      // Stop the recorder
      console.log("[Recording] Stopping recorder...");
      await audioRecorder.stop();

      // Reset audio mode
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      const uri = audioRecorder.uri;
      console.log("[Recording] Stopped, URI:", uri);

      if (!uri) {
        throw new Error("No recording URI available. The recording may have failed.");
      }

      // Read file info
      const fileInfo = await FileSystem.getInfoAsync(uri);
      console.log("[Recording] File info:", JSON.stringify(fileInfo));

      if (!fileInfo.exists) {
        throw new Error("Recording file does not exist");
      }

      // Read file as base64
      console.log("[Recording] Reading file as base64...");
      const base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });
      console.log("[Recording] Base64 length:", base64Data.length, "characters");

      if (!base64Data || base64Data.length === 0) {
        throw new Error("Failed to read recording file - empty content");
      }

      // Determine file format and extension
      const fileExtension = Platform.OS === "ios" ? "m4a" : "m4a";
      const contentType = "audio/mp4";
      const audioFormat = "m4a";

      // Upload to Supabase using base64
      const audioPath = `${user.id}/${meetingId}/audio.${fileExtension}`;
      console.log("[Recording] Uploading to:", audioPath);

      // Decode base64 to ArrayBuffer for upload
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      console.log("[Recording] Uploading", bytes.length, "bytes...");

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from("meeting-audio")
        .upload(audioPath, bytes, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error("[Recording] Upload error:", uploadError);
        throw uploadError;
      }

      console.log("[Recording] Upload successful:", uploadData);

      // Save streaming transcript turns if available
      if (transcriptTurns.length > 0) {
        console.log("[Recording] Saving", transcriptTurns.length, "transcript turns...");
        await saveStreamingTranscript(meetingId, transcriptTurns);
      }

      // Trigger processing
      await uploadAudio({
        meetingId,
        audioPath,
        audioFormat,
        durationSeconds: Math.round(durationMillis / 1000),
        recordedAt: recordedAt || new Date().toISOString(),
      });

      router.replace({ pathname: "/processing", params: { meetingId } });
    } catch (err) {
      console.error("[Recording] Stop/upload error:", err);
      setIsUploading(false);

      try {
        await updateMeeting({
          meetingId,
          updates: {
            status: "failed",
            error_message: err instanceof Error ? err.message : "Upload failed",
          },
        });
      } catch (updateErr) {
        console.error("[Recording] Failed to update meeting status:", updateErr);
      }

      if (Platform.OS !== "web") {
        Alert.alert(
          "Recording Error",
          err instanceof Error ? err.message : "Failed to save recording. Please try again."
        );
      }
    }
  };

  // Save streaming transcript to database
  const saveStreamingTranscript = async (meetingId: string, turns: TranscriptTurn[]) => {
    try {
      // Convert turns to segments format
      const segments = turns.map((turn, index) => ({
        meeting_id: meetingId,
        speaker: turn.speaker || `Speaker ${index % 2 === 0 ? 'A' : 'B'}`,
        text: turn.text,
        start_ms: turn.startTime,
        end_ms: turn.endTime,
        confidence: turn.confidence || 0.9,
      }));

      if (segments.length > 0) {
        const { error } = await supabase
          .from("transcript_segments")
          .insert(segments);

        if (error) {
          console.error("[Recording] Error saving streaming transcript:", error);
        } else {
          console.log("[Recording] Saved", segments.length, "transcript segments");
        }
      }
    } catch (err) {
      console.error("[Recording] Error saving streaming transcript:", err);
    }
  };

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

  const isPaused = !recorderState.isRecording && recorderState.durationMillis > 0;

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

        <Text style={styles.statusText}>
          {isPaused ? "Paused" : isUploading ? "Uploading..." : "Recording"}
        </Text>

        <Text style={styles.timer}>{formatTime(recorderState.durationMillis)}</Text>

        {/* Streaming Connection Status */}
        {isStreamingConnected && (
          <View style={styles.streamingStatus}>
            <View style={styles.streamingDot} />
            <Text style={styles.streamingText}>Live Transcription Active</Text>
          </View>
        )}

        {/* Live Transcript Display */}
        <View style={styles.transcriptContainer}>
          <LiveTranscript
            turns={transcriptTurns}
            currentPartial={currentPartial}
            isConnected={isStreamingConnected}
          />
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <Pressable
            style={[styles.controlButton, styles.pauseButton]}
            onPress={handlePauseResume}
            disabled={isUploading}
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
  streamingStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    gap: 8,
  },
  streamingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  streamingText: {
    fontSize: 13,
    color: "#10B981",
    fontWeight: "500",
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
