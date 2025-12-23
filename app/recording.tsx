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
// Use expo-file-system for reliable file reading
import { File as ExpoFile } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { useMeetings } from "@/contexts/MeetingContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";

export default function RecordingScreen() {
  const router = useRouter();
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const { uploadAudio, updateMeeting } = useMeetings();
  const { user } = useAuth();

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recordedAt, setRecordedAt] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hasStartedRef = useRef(false);

  const startRecording = useCallback(async () => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    try {
      console.log("[Recording] Requesting permissions...");
      const { status } = await Audio.requestPermissionsAsync();
      console.log("[Recording] Permission status:", status);

      if (status !== "granted") {
        throw new Error(
          "Microphone permission denied. Please grant microphone access in your device settings."
        );
      }

      console.log("[Recording] Setting audio mode...");
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      console.log("[Recording] Creating recording...");
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (status) => {
          // Log metering data to verify microphone is capturing audio
          if (status.isRecording && status.metering !== undefined) {
            console.log("[Recording] Metering:", status.metering, "dB");
          }
        },
        100 // Update every 100ms
      );

      recordingRef.current = recording;
      setIsRecording(true);
      setRecordedAt(new Date().toISOString());
      console.log("[Recording] Started successfully!");
    } catch (err) {
      console.error("[Recording] Start error:", err);
      if (Platform.OS !== "web") {
        Alert.alert(
          "Recording Error",
          err instanceof Error ? err.message : "Failed to start recording"
        );
      }
      router.back();
    }
  }, [router]);

  useEffect(() => {
    startRecording();
  }, [startRecording]);

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

  // Timer
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
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
    const recording = recordingRef.current;
    if (!recording || !meetingId || !user?.id) return;

    setIsUploading(true);

    try {
      // Get status before stopping to get duration
      const statusBeforeStop = await recording.getStatusAsync();
      const durationMillis = statusBeforeStop.durationMillis || elapsedSeconds * 1000;
      console.log("[Recording] Duration before stop:", durationMillis, "ms");

      console.log("[Recording] Stopping and unloading...");
      await recording.stopAndUnloadAsync();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const uri = recording.getURI();
      console.log("[Recording] Stopped, URI:", uri);

      if (!uri) {
        throw new Error("No recording URI available. The recording may have failed.");
      }

      // Platform-specific file reading
      let fileData: Blob;
      let contentType: string;
      let fileExtension: string;
      let audioFormat: string;

      if (Platform.OS === "web") {
        console.log("[Recording] Web platform - using fetch...");
        const response = await fetch(uri);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.statusText}`);
        }
        fileData = await response.blob();
        contentType = fileData.type || "audio/webm";
        const isWebm = contentType.includes("webm") || contentType.includes("ogg");
        fileExtension = isWebm ? "webm" : "m4a";
        audioFormat = isWebm ? "webm" : "m4a";
        console.log("[Recording] Web audio format:", contentType, "->", audioFormat);
      } else {
        // NATIVE PLATFORM (iOS/Android)
        console.log("[Recording] Native platform - reading file...");
        console.log("[Recording] File URI:", uri);
        
        let bytesData: Uint8Array | null = null;
        let fileSize = 0;
        
        // ========== Method 1: Try the new ExpoFile API ==========
        try {
          console.log("[Recording] Method 1: Trying ExpoFile API...");
          const audioFile = new ExpoFile(uri);
          
          console.log("[Recording] - ExpoFile created successfully");
          console.log("[Recording] - exists:", audioFile.exists);
          console.log("[Recording] - size:", audioFile.size, "bytes");
          console.log("[Recording] - type:", audioFile.type);
          
          if (audioFile.exists && audioFile.size > 0) {
            fileSize = audioFile.size;
            console.log("[Recording] - Reading bytes...");
            bytesData = await audioFile.bytes();
            console.log("[Recording] - bytes() returned:", bytesData?.length || 0, "bytes");
            
            if (bytesData && bytesData.length > 0) {
              console.log("[Recording] Method 1 SUCCESS: Read", bytesData.length, "bytes");
            } else {
              console.log("[Recording] Method 1 FAILED: bytes() returned empty");
              bytesData = null;
            }
          } else {
            console.log("[Recording] Method 1 FAILED: File doesn't exist or is empty");
          }
        } catch (method1Error) {
          console.warn("[Recording] Method 1 ERROR:", method1Error);
        }
        
        // ========== Method 2: Try legacy FileSystem API ==========
        if (!bytesData || bytesData.length === 0) {
          try {
            console.log("[Recording] Method 2: Trying legacy FileSystem API...");
            
            // Get file info
            const fileInfo = await LegacyFileSystem.getInfoAsync(uri);
            console.log("[Recording] - File info:", JSON.stringify(fileInfo));
            
            if (!fileInfo.exists) {
              throw new Error("Recording file does not exist");
            }
            
            fileSize = fileInfo.size || 0;
            console.log("[Recording] - File size from info:", fileSize, "bytes");
            
            if (fileSize === 0) {
              // Check if it's a directory
              console.warn("[Recording] - File shows 0 bytes, checking if it's really a file...");
            }
            
            // Read as base64
            console.log("[Recording] - Reading file as base64...");
            const base64Data = await LegacyFileSystem.readAsStringAsync(uri, {
              encoding: LegacyFileSystem.EncodingType.Base64,
            });
            console.log("[Recording] - Base64 length:", base64Data.length, "characters");
            
            if (!base64Data || base64Data.length === 0) {
              throw new Error("readAsStringAsync returned empty");
            }
            
            // Convert base64 to bytes (React Native compatible - no atob)
            console.log("[Recording] - Decoding base64...");
            bytesData = base64ToUint8Array(base64Data);
            console.log("[Recording] - Decoded:", bytesData.length, "bytes");
            
            if (bytesData && bytesData.length > 0) {
              console.log("[Recording] Method 2 SUCCESS: Decoded", bytesData.length, "bytes");
            } else {
              console.log("[Recording] Method 2 FAILED: base64 decode returned empty");
              bytesData = null;
            }
          } catch (method2Error) {
            console.error("[Recording] Method 2 ERROR:", method2Error);
          }
        }
        
        // ========== Validate we got data ==========
        if (!bytesData || bytesData.length === 0) {
          // Log diagnostic info
          console.error("[Recording] CRITICAL: All file reading methods failed!");
          console.error("[Recording] URI was:", uri);
          console.error("[Recording] File size was reported as:", fileSize);
          
          throw new Error(
            `Failed to read audio file. The recording file may be empty or corrupted. ` +
            `File size reported: ${fileSize} bytes. ` +
            `Please check microphone permissions and try again.`
          );
        }
        
        if (bytesData.length < 1000) {
          throw new Error(
            `Recording file is too small (${bytesData.length} bytes). ` +
            `Please try recording again for a longer duration.`
          );
        }
        
        // Create blob from bytes
        contentType = "audio/mp4";
        fileExtension = "m4a";
        audioFormat = "m4a";
        
        fileData = new Blob([bytesData], { type: contentType });
        console.log("[Recording] Created blob:", fileData.size, "bytes, type:", fileData.type);
        
        // Verify blob size matches bytes
        if (fileData.size !== bytesData.length) {
          console.warn("[Recording] WARNING: Blob size mismatch!", {
            blobSize: fileData.size,
            bytesLength: bytesData.length,
          });
        }
      }

      // Final validation
      console.log("[Recording] Final blob size:", fileData.size, "bytes");
      
      if (fileData.size === 0) {
        throw new Error(
          "Recording is empty (0 bytes). This may be due to microphone permission issues. " +
          "Please check your device settings and try again."
        );
      }

      // Upload to Supabase
      const audioPath = `${user.id}/${meetingId}/audio.${fileExtension}`;
      console.log("[Recording] Uploading", fileData.size, "bytes to:", audioPath);

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from("meeting-audio")
        .upload(audioPath, fileData, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error("[Recording] Upload error:", uploadError);
        throw uploadError;
      }

      console.log("[Recording] Upload successful:", uploadData);

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
    } finally {
      recordingRef.current = null;
    }
  };

  // Base64 to Uint8Array decoder (React Native compatible - doesn't use atob)
  const base64ToUint8Array = (base64: string): Uint8Array => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const lookup = new Uint8Array(256);
    for (let i = 0; i < chars.length; i++) {
      lookup[chars.charCodeAt(i)] = i;
    }
    
    // Remove whitespace and padding
    const cleanBase64 = base64.replace(/[^A-Za-z0-9+/]/g, "");
    const paddingLen = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    const outputLen = Math.floor((cleanBase64.length * 3) / 4) - paddingLen;
    const output = new Uint8Array(outputLen);
    
    let p = 0;
    for (let i = 0; i < cleanBase64.length; i += 4) {
      const a = lookup[cleanBase64.charCodeAt(i)];
      const b = lookup[cleanBase64.charCodeAt(i + 1)];
      const c = lookup[cleanBase64.charCodeAt(i + 2)];
      const d = lookup[cleanBase64.charCodeAt(i + 3)];
      
      output[p++] = (a << 2) | (b >> 4);
      if (p < outputLen) output[p++] = ((b & 15) << 4) | (c >> 2);
      if (p < outputLen) output[p++] = ((c & 3) << 6) | d;
    }
    
    return output;
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
