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
import * as FileSystem from "expo-file-system/legacy";
import { useMeetings } from "@/contexts/MeetingContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";

export default function RecordingScreen() {
  const router = useRouter();
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const { uploadAudio, updateMeeting } = useMeetings();
  const { user } = useAuth();

  const [isUploading, setIsUploading] = useState(false);
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [hasStartedRecording, setHasStartedRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Use the new expo-audio hooks
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, (status) => {
    // Recording status callback
    if (status.isFinished) {
      console.log("[Recording] Recording finished");
    }
  });
  
  const recorderState = useAudioRecorderState(audioRecorder);

  const startRecording = useCallback(async () => {
    if (hasStartedRecording) return;
    setHasStartedRecording(true);

    try {
      // Request recording permissions using new API
      console.log("[Recording] Requesting recording permissions...");
      const status = await AudioModule.requestRecordingPermissionsAsync();
      console.log("[Recording] Permission status:", status);
      
      if (!status.granted) {
        throw new Error("Microphone permission was denied. Please grant microphone access in your device settings.");
      }

      // Configure audio mode for recording using new API
      console.log("[Recording] Setting audio mode...");
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      
      // Prepare and start recording
      console.log("[Recording] Preparing recorder...");
      await audioRecorder.prepareToRecordAsync();
      
      console.log("[Recording] Starting recording...");
      audioRecorder.record();
      
      setRecordedAt(new Date().toISOString());
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
  }, [hasStartedRecording, audioRecorder, router]);

  useEffect(() => {
    startRecording();
  }, [startRecording]);

  // Pulse animation for recording indicator
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

  // Timer - update based on recorder state
  useEffect(() => {
    if (recorderState.isRecording) {
      timerRef.current = setInterval(() => {
        // Use the recorder's duration if available, otherwise use elapsed seconds
        const durationSec = Math.floor(recorderState.durationMillis / 1000);
        setElapsedSeconds(durationSec);
      }, 500);
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
  }, [recorderState.isRecording, recorderState.durationMillis]);

  const handlePauseResume = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      if (!recorderState.isRecording) {
        // Resume recording
        audioRecorder.record();
      } else {
        // Pause recording
        audioRecorder.pause();
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
      const durationMs = recorderState.durationMillis;
      console.log("[Recording] Duration before stop:", durationMs, "ms");
      
      // Validate minimum recording duration
      if (durationMs < 1000) {
        throw new Error("Recording too short. Please record for at least 1 second.");
      }
      
      console.log("[Recording] Stopping recording...");
      await audioRecorder.stop();
      
      // Reset audio mode
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      
      // Get the URI from the recorder
      const uri = audioRecorder.uri;
      console.log("[Recording] Stopped, URI:", uri);

      if (!uri) {
        throw new Error("No recording URI available. The recording may have failed.");
      }

      // Get the audio data using expo-file-system (fixes iOS fetch issue with file:// URIs)
      console.log("[Recording] Reading audio file from URI...");
      
      let blob: Blob;
      let contentType: string;
      let fileExtension: string;
      let audioFormat: string;
      
      if (Platform.OS === "web") {
        // On web, use fetch as it works correctly
        const response = await fetch(uri);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.statusText}`);
        }
        blob = await response.blob();
        contentType = blob.type || "audio/webm";
        const isWebm = contentType.includes("webm") || contentType.includes("ogg");
        fileExtension = isWebm ? "webm" : "m4a";
        audioFormat = isWebm ? "webm" : "m4a";
        console.log("[Recording] Web audio format:", contentType, "->", audioFormat);
      } else {
        // On native (iOS/Android), use expo-file-system to read the file
        // This fixes the issue where fetch(file://) returns an empty blob on iOS
        
        // First, verify the file exists and get its info
        const fileInfo = await FileSystem.getInfoAsync(uri);
        console.log("[Recording] File info:", JSON.stringify(fileInfo));
        
        if (!fileInfo.exists) {
          throw new Error("Recording file does not exist. The recording may have failed.");
        }
        
        if (fileInfo.size === 0) {
          throw new Error("Recording file is empty (0 bytes). This may indicate a recording failure.");
        }
        
        // Read the file as base64
        console.log("[Recording] Reading file as base64...");
        const base64Data = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        console.log("[Recording] Base64 data length:", base64Data.length, "characters");
        
        if (!base64Data || base64Data.length === 0) {
          throw new Error("Failed to read audio file data.");
        }
        
        // Convert base64 to blob
        // Decode base64 to binary
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Native (iOS/Android) uses M4A format
        contentType = "audio/mp4";
        fileExtension = "m4a";
        audioFormat = "m4a";
        
        blob = new Blob([bytes], { type: contentType });
        console.log("[Recording] Created blob from file, size:", blob.size, "bytes (file size:", fileInfo.size, ")");
      }
      
      console.log("[Recording] Blob size:", blob.size, "bytes, type:", blob.type);
      
      // Validate that we have actual audio data
      if (blob.size === 0) {
        throw new Error("Recording is empty (0 bytes). This may be due to microphone permission issues. Please check your device settings and try again.");
      }
      
      if (blob.size < 1000) {
        // Audio file too small to be valid (less than 1KB)
        throw new Error(`Recording file is too small (${blob.size} bytes). Please try recording again for a longer duration.`);
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
        durationSeconds: Math.round(durationMs / 1000),
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

  const isPaused = recorderState.canRecord && !recorderState.isRecording && hasStartedRecording;

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
