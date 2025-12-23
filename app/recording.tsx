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
import { Pause, Play, Square, Mic, ChevronLeft } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  useAudioRecorder,
  RecordingPresets,
  useAudioRecorderState,
  setAudioModeAsync,
} from "expo-audio";
import { useMeetings } from "@/contexts/MeetingContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";

export default function RecordingScreen() {
  const router = useRouter();
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const { finalizeUpload, updateMeeting } = useMeetings();
  const { user } = useAuth();

  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const hasStartedRecording = useRef(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const startRecording = useCallback(async () => {
    if (hasStartedRecording.current) return;
    hasStartedRecording.current = true;

    try {
      console.log("[Recording] Setting audio mode...");
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      
      console.log("[Recording] Starting recording...");
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setStartedAt(new Date().toISOString());
      console.log("[Recording] Recording started");
    } catch (err) {
      console.error("[Recording] Start error:", err);
      if (Platform.OS !== "web") {
        Alert.alert("Error", "Failed to start recording. Please try again.");
      }
      router.back();
    }
  }, [audioRecorder, router]);

  useEffect(() => {
    startRecording();
  }, [startRecording]);

  useEffect(() => {
    if (recorderState.isRecording && !isPaused) {
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
  }, [recorderState.isRecording, isPaused, pulseAnim]);

  useEffect(() => {
    if (recorderState.isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [recorderState.isRecording, isPaused]);

  const handlePauseResume = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (isPaused) {
      audioRecorder.record();
      setIsPaused(false);
    } else {
      audioRecorder.pause();
      setIsPaused(true);
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
    if (!meetingId) return;

    setIsUploading(true);
    const endedAt = new Date().toISOString();

    try {
      console.log("[Recording] Stopping recording...");
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      console.log("[Recording] Stopped, URI:", uri);

      if (!uri) {
        throw new Error("No recording URI");
      }

      await updateMeeting({
        meetingId,
        updates: { status: "uploading" },
      });

      const response = await fetch(uri);
      const blob = await response.blob();
      
      // Determine file extension, content type, and audio format based on platform
      // Web browsers typically record in WebM format, native apps use M4A
      let fileExtension: string;
      let contentType: string;
      let audioFormat: 'webm' | 'm4a';
      
      if (Platform.OS === "web") {
        // Web browsers record in WebM format (especially Chrome)
        // Use the blob's actual type if available, fallback to webm
        contentType = blob.type || "audio/webm";
        const isWebm = contentType.includes("webm") || contentType.includes("ogg");
        fileExtension = isWebm ? "webm" : "m4a";
        audioFormat = isWebm ? "webm" : "m4a";
        console.log("[Recording] Web audio format:", contentType, "-> audioFormat:", audioFormat);
      } else {
        // Native (iOS/Android) uses M4A format
        contentType = "audio/mp4";
        fileExtension = "m4a";
        audioFormat = "m4a";
      }
      
      const audioPath = `${user?.id}/${meetingId}/audio.${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from("meeting-audio")
        .upload(audioPath, blob, {
          contentType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      console.log("[Recording] Upload complete, triggering finalization with format:", audioFormat);

      // Finalize upload - this will trigger transcoding if format is webm
      await finalizeUpload({
        meetingId,
        audioPath,
        audioFormat,
        durationSeconds: elapsedSeconds,
        startedAt: startedAt || new Date().toISOString(),
        endedAt,
      });

      router.replace({ pathname: "/processing", params: { meetingId } });
    } catch (err) {
      console.error("[Recording] Stop/upload error:", err);
      setIsUploading(false);
      
      if (Platform.OS !== "web") {
        Alert.alert("Error", "Failed to save recording. Please try again.");
      }
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
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

        <Text style={styles.timer}>{formatTime(elapsedSeconds)}</Text>

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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  recordingIndicator: {
    marginBottom: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.recording,
  },
  recordingDot: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.recording,
    justifyContent: "center",
    alignItems: "center",
  },
  recordingDotPaused: {
    backgroundColor: Colors.surfaceLight,
  },
  statusText: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: Colors.text,
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  timer: {
    fontSize: 68,
    fontWeight: "200" as const,
    color: Colors.text,
    fontVariant: ["tabular-nums"],
    marginBottom: 56,
    letterSpacing: -2,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 40,
  },
  controlButton: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 40,
  },
  pauseButton: {
    width: 76,
    height: 76,
    backgroundColor: Colors.surfaceLight,
  },
  stopButton: {
    width: 84,
    height: 84,
    backgroundColor: Colors.recording,
  },
  hint: {
    marginTop: 40,
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
  },
});
