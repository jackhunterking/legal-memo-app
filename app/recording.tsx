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
import { Pause, Play, Square, Mic, ChevronLeft, Settings } from "lucide-react-native";
import * as Linking from "expo-linking";
import * as Haptics from "expo-haptics";
import {
  useAudioRecorder,
  RecordingPresets,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
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
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const permissionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitiatedRef = useRef(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const startRecording = useCallback(async () => {
    try {
      console.log("[Recording] Starting recording...");
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setStartedAt(new Date().toISOString());
      console.log("[Recording] Recording started");
    } catch (err) {
      console.error("[Recording] Start error:", err);
    }
  }, [audioRecorder]);

  const requestPermission = useCallback(async () => {
    if (isRequestingPermission) return false;
    
    setIsRequestingPermission(true);
    
    // Clear any existing timeout
    if (permissionTimeoutRef.current) {
      clearTimeout(permissionTimeoutRef.current);
    }
    
    // Set a timeout in case permission request hangs
    permissionTimeoutRef.current = setTimeout(() => {
      console.log("[Recording] Permission request timed out");
      setIsRequestingPermission(false);
      setHasPermission(false);
      setPermissionDenied(true);
    }, 10000);
    
    try {
      console.log("[Recording] Requesting microphone permission...");
      const result = await requestRecordingPermissionsAsync();
      
      // Clear timeout since we got a response
      if (permissionTimeoutRef.current) {
        clearTimeout(permissionTimeoutRef.current);
        permissionTimeoutRef.current = null;
      }
      
      const { granted, canAskAgain } = result;
      console.log("[Recording] Permission result - granted:", granted, "canAskAgain:", canAskAgain);
      
      setIsRequestingPermission(false);
      setHasPermission(granted);
      setPermissionDenied(!granted);

      if (granted) {
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
        });
      }
      
      return granted;
    } catch (err) {
      console.error("[Recording] Permission request error:", err);
      
      // Clear timeout
      if (permissionTimeoutRef.current) {
        clearTimeout(permissionTimeoutRef.current);
        permissionTimeoutRef.current = null;
      }
      
      setIsRequestingPermission(false);
      setHasPermission(false);
      setPermissionDenied(true);
      return false;
    }
  }, [isRequestingPermission]);

  useEffect(() => {
    if (!hasInitiatedRef.current) {
      hasInitiatedRef.current = true;
      requestPermission();
    }
    
    return () => {
      if (permissionTimeoutRef.current) {
        clearTimeout(permissionTimeoutRef.current);
      }
    };
  }, [requestPermission]);

  useEffect(() => {
    if (hasPermission && !recorderState.isRecording && !startedAt) {
      startRecording();
    }
  }, [hasPermission, recorderState.isRecording, startedAt, startRecording]);

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

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <ChevronLeft size={28} color={Colors.text} />
          </Pressable>
        </View>
        <View style={styles.permissionContainer}>
          <View style={styles.permissionIconContainer}>
            <Mic size={48} color={Colors.accent} />
          </View>
          <Text style={styles.permissionTitle}>Microphone Access</Text>
          <Text style={styles.permissionText}>
            {isRequestingPermission 
              ? "Requesting microphone permission..." 
              : "Tap below to request microphone access"}
          </Text>
          {!isRequestingPermission && (
            <Pressable 
              style={styles.permissionButton} 
              onPress={requestPermission}
            >
              <Text style={styles.permissionButtonText}>Request Permission</Text>
            </Pressable>
          )}
          {Platform.OS !== 'web' && (
            <Pressable 
              style={styles.settingsButton} 
              onPress={() => Linking.openSettings()}
            >
              <Settings size={18} color={Colors.accent} />
              <Text style={styles.settingsButtonText}>Open Settings</Text>
            </Pressable>
          )}
          <Pressable 
            style={styles.secondaryButton} 
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasPermission || permissionDenied) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <ChevronLeft size={28} color={Colors.text} />
          </Pressable>
        </View>
        <View style={styles.permissionContainer}>
          <View style={styles.permissionIconContainer}>
            <Mic size={48} color={Colors.accent} />
          </View>
          <Text style={styles.permissionTitle}>Microphone Access Required</Text>
          <Text style={styles.permissionText}>
            To record meetings, please grant microphone permission.
          </Text>
          <Pressable 
            style={styles.permissionButton} 
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </Pressable>
          {Platform.OS !== 'web' && (
            <Pressable 
              style={styles.settingsButton} 
              onPress={() => Linking.openSettings()}
            >
              <Settings size={18} color={Colors.accent} />
              <Text style={styles.settingsButtonText}>Open Settings</Text>
            </Pressable>
          )}
          <Pressable 
            style={styles.secondaryButton} 
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  permissionIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  permissionButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginBottom: 16,
  },
  permissionButtonText: {
    fontSize: 17,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  secondaryButtonText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  settingsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accent,
    marginBottom: 12,
  },
  settingsButtonText: {
    fontSize: 16,
    fontWeight: "500" as const,
    color: Colors.accent,
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
