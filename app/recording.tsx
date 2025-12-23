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
import { Audio } from "expo-av";
import { useMeetings } from "@/contexts/MeetingContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";

export default function RecordingScreen() {
  const router = useRouter();
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const { uploadAudio, updateMeeting } = useMeetings();
  const { user } = useAuth();

  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const hasStartedRecording = useRef(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recordingRef = useRef<Audio.Recording | null>(null);

  const startRecording = useCallback(async () => {
    if (hasStartedRecording.current) return;
    hasStartedRecording.current = true;

    try {
      // Request recording permissions
      console.log("[Recording] Requesting recording permissions...");
      const { status } = await Audio.requestPermissionsAsync();
      console.log("[Recording] Permission status:", status);
      
      if (status !== "granted") {
        throw new Error("Microphone permission was denied. Please grant microphone access in your device settings.");
      }

      // Configure audio mode for recording
      console.log("[Recording] Setting audio mode...");
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });
      
      // Create and start recording with high quality settings
      console.log("[Recording] Creating recording instance...");
      const { recording } = await Audio.Recording.createAsync(
        {
          isMeteringEnabled: true,
          android: {
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 44100,
            numberOfChannels: 2,
            bitRate: 128000,
          },
          ios: {
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.HIGH,
            sampleRate: 44100,
            numberOfChannels: 2,
            bitRate: 128000,
          },
          web: {
            mimeType: 'audio/webm;codecs=opus',
            bitsPerSecond: 128000,
          },
        },
        (status) => {
          // Recording status callback
          if (status.isRecording) {
            console.log("[Recording] Metering:", status.metering);
          }
        },
        100 // Update every 100ms
      );
      
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordedAt(new Date().toISOString());
      
      // Verify recording started
      const recordingStatus = await recording.getStatusAsync();
      console.log("[Recording] Initial status:", recordingStatus);
      
      if (!recordingStatus.isRecording) {
        throw new Error("Failed to start recording. The recorder is not in a valid state.");
      }
      
      console.log("[Recording] Recording started successfully!");
    } catch (err) {
      console.error("[Recording] Start error:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      if (Platform.OS !== "web") {
        Alert.alert(
          "Recording Error", 
          `Failed to start recording: ${errorMessage}`
        );
      }
      router.back();
    }
  }, [router]);

  useEffect(() => {
    startRecording();
  }, [startRecording]);

  // Pulse animation for recording indicator
  useEffect(() => {
    if (isRecording && !isPaused) {
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
  }, [isRecording, isPaused, pulseAnim]);

  // Timer
  useEffect(() => {
    if (isRecording && !isPaused) {
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
  }, [isRecording, isPaused]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(console.error);
      }
    };
  }, []);

  const handlePauseResume = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    const recording = recordingRef.current;
    if (!recording) return;

    try {
      if (isPaused) {
        await recording.startAsync();
        setIsPaused(false);
      } else {
        await recording.pauseAsync();
        setIsPaused(true);
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

    const recording = recordingRef.current;
    if (!recording) {
      console.error("[Recording] No recording instance found");
      Alert.alert("Error", "No active recording found.");
      return;
    }

    setIsUploading(true);
    setIsRecording(false);

    try {
      // Get status before stopping
      const statusBeforeStop = await recording.getStatusAsync();
      console.log("[Recording] Status before stop:", JSON.stringify(statusBeforeStop));
      console.log("[Recording] Duration:", statusBeforeStop.durationMillis, "ms");
      
      // Validate minimum recording duration
      if (statusBeforeStop.durationMillis < 1000) {
        throw new Error("Recording too short. Please record for at least 1 second.");
      }
      
      console.log("[Recording] Stopping and unloading recording...");
      await recording.stopAndUnloadAsync();
      
      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      
      const uri = recording.getURI();
      console.log("[Recording] Stopped, URI:", uri);

      if (!uri) {
        throw new Error("No recording URI available. The recording may have failed.");
      }

      // Get the audio blob
      console.log("[Recording] Fetching audio from URI...");
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      console.log("[Recording] Blob size:", blob.size, "bytes, type:", blob.type);
      
      // Validate that we have actual audio data
      if (blob.size === 0) {
        throw new Error("Recording is empty (0 bytes). This may be due to microphone permission issues. Please check your device settings and try again.");
      }
      
      if (blob.size < 1000) {
        // Audio file too small to be valid (less than 1KB)
        throw new Error(`Recording file is too small (${blob.size} bytes). Please try recording again for a longer duration.`);
      }
      
      // Determine file format based on platform
      let fileExtension: string;
      let contentType: string;
      let audioFormat: string;
      
      if (Platform.OS === "web") {
        contentType = blob.type || "audio/webm";
        const isWebm = contentType.includes("webm") || contentType.includes("ogg");
        fileExtension = isWebm ? "webm" : "m4a";
        audioFormat = isWebm ? "webm" : "m4a";
        console.log("[Recording] Web audio format:", contentType, "->", audioFormat);
      } else {
        // Native (iOS/Android) uses M4A format
        contentType = "audio/mp4";
        fileExtension = "m4a";
        audioFormat = "m4a";
      }
      
      // Upload path: user_id/meeting_id/audio.ext
      const audioPath = `${user.id}/${meetingId}/audio.${fileExtension}`;

      console.log("[Recording] Uploading", blob.size, "bytes to:", audioPath);

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("meeting-audio")
        .upload(audioPath, blob, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error("[Recording] Upload error:", uploadError);
        throw uploadError;
      }

      console.log("[Recording] Upload complete, triggering processing...");

      // Update meeting and trigger processing
      await uploadAudio({
        meetingId,
        audioPath,
        audioFormat,
        durationSeconds: Math.round(statusBeforeStop.durationMillis / 1000),
        recordedAt: recordedAt || new Date().toISOString(),
      });

      // Navigate to processing screen
      router.replace({ pathname: "/processing", params: { meetingId } });
    } catch (err) {
      console.error("[Recording] Stop/upload error:", err);
      setIsUploading(false);
      
      // Update meeting status to failed
      try {
        await updateMeeting({
          meetingId,
          updates: { 
            status: "failed", 
            error_message: err instanceof Error ? err.message : "Upload failed" 
          },
        });
      } catch (updateErr) {
        console.error("[Recording] Failed to update meeting status:", updateErr);
      }
      
      if (Platform.OS !== "web") {
        Alert.alert("Recording Error", err instanceof Error ? err.message : "Failed to save recording. Please try again.");
      }
    } finally {
      recordingRef.current = null;
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
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  timer: {
    fontSize: 68,
    fontWeight: "200",
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
