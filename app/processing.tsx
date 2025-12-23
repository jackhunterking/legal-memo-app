import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  Easing,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { 
  Upload, 
  FileText, 
  Brain, 
  ListChecks, 
  Search, 
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetingDetails, useMeetings } from "@/contexts/MeetingContext";
import Colors from "@/constants/colors";

// Processing steps - server-side processing, we just show progress
const STEPS = [
  { key: "uploading", label: "Uploading", icon: Upload },
  { key: "transcribing", label: "Transcribing", icon: FileText },
  { key: "summarizing", label: "Analyzing", icon: Brain },
  { key: "actions", label: "Extracting Tasks", icon: ListChecks },
  { key: "indexing", label: "Finalizing", icon: Search },
];

export default function ProcessingScreen() {
  const router = useRouter();
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const { data: meeting, refetch } = useMeetingDetails(meetingId || null);
  const { retryProcessing, triggerProcessing } = useMeetings();

  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [estimatedStep, setEstimatedStep] = useState(0);
  const processingTriggeredRef = useRef(false);

  // Continuous spinner animation
  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => spin.stop();
  }, [spinAnim]);

  // Pulsing animation for active step icon
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Trigger processing when screen loads (if meeting is in processing state)
  useEffect(() => {
    const triggerIfNeeded = async () => {
      if (
        meeting?.status === 'processing' &&
        meeting?.audio_path &&
        !processingTriggeredRef.current
      ) {
        processingTriggeredRef.current = true;
        console.log('[Processing] Triggering server-side processing for:', meetingId);
        
        try {
          await triggerProcessing(meeting.id);
        } catch (err) {
          console.error('[Processing] Failed to trigger processing:', err);
          // Processing will continue in background even if trigger call fails
        }
      }
    };

    triggerIfNeeded();
  }, [meeting?.status, meeting?.audio_path, meeting?.id, meetingId, triggerProcessing]);

  // Simulate progress through steps while processing (for UI feedback)
  useEffect(() => {
    if (meeting?.status === 'processing') {
      const interval = setInterval(() => {
        setEstimatedStep(prev => {
          // Slowly progress through steps, but don't complete until status changes
          if (prev < STEPS.length - 1) {
            return prev + 1;
          }
          return prev;
        });
      }, 15000); // Move to next step every 15 seconds

      return () => clearInterval(interval);
    } else if (meeting?.status === 'ready') {
      setEstimatedStep(STEPS.length);
    }
  }, [meeting?.status]);

  // Navigate to meeting when ready
  useEffect(() => {
    if (meeting?.status === "ready") {
      setTimeout(() => {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        router.replace(`/meeting/${meetingId}`);
      }, 1200);
    }
  }, [meeting?.status, meetingId, router]);

  const handleRetry = async () => {
    if (!meetingId) return;
    
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setEstimatedStep(0);
    processingTriggeredRef.current = false;

    try {
      await retryProcessing(meetingId);
      await refetch();
    } catch (err) {
      console.error("[Processing] Retry error:", err);
    }
  };

  const handleViewAnyway = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.replace(`/meeting/${meetingId}`);
  };

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const currentStep = meeting?.status === 'ready' ? STEPS.length : estimatedStep;
  const isFailed = meeting?.status === "failed";
  const isComplete = meeting?.status === "ready";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {isFailed ? (
          <>
            <View style={styles.failedIcon}>
              <AlertCircle size={64} color={Colors.error} />
            </View>
            <Text style={styles.title}>Processing Failed</Text>
            <Text style={styles.errorMessage}>
              {meeting?.error_message || "An error occurred while processing your meeting."}
            </Text>

            <View style={styles.failedActions}>
              <Pressable style={styles.retryButton} onPress={handleRetry}>
                <RefreshCw size={20} color={Colors.text} />
                <Text style={styles.retryButtonText}>Retry Processing</Text>
              </Pressable>

              <Pressable style={styles.viewAnywayButton} onPress={handleViewAnyway}>
                <Text style={styles.viewAnywayText}>View Meeting Anyway</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.spinnerWrapper}>
              {!isComplete && (
                <Animated.View
                  style={[
                    styles.spinnerRing,
                    { transform: [{ rotate: spin }] },
                  ]}
                />
              )}
              <View
                style={[
                  styles.spinnerContainer,
                  isComplete && styles.spinnerComplete,
                ]}
              >
                {isComplete ? (
                  <CheckCircle size={48} color={Colors.success} />
                ) : (
                  <Brain size={48} color={Colors.accentLight} />
                )}
              </View>
            </View>

            <Text style={styles.title}>
              {isComplete ? "Processing Complete!" : "Processing Meeting"}
            </Text>
            <Text style={styles.subtitle}>
              {isComplete
                ? "Your meeting is ready to view"
                : "AI is transcribing and analyzing your meeting"}
            </Text>

            <View style={styles.steps}>
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                const isActive = index === currentStep;
                const isDone = index < currentStep;

                return (
                  <View key={step.key} style={styles.step}>
                    <Animated.View
                      style={[
                        styles.stepIcon,
                        isDone && styles.stepIconDone,
                        isActive && styles.stepIconActive,
                        isActive && { transform: [{ scale: pulseAnim }] },
                      ]}
                    >
                      {isDone ? (
                        <CheckCircle size={20} color={Colors.success} />
                      ) : (
                        <Icon
                          size={20}
                          color={isActive ? Colors.accentLight : Colors.textMuted}
                        />
                      )}
                    </Animated.View>
                    <Text
                      style={[
                        styles.stepLabel,
                        isDone && styles.stepLabelDone,
                        isActive && styles.stepLabelActive,
                      ]}
                    >
                      {step.label}{isActive ? "..." : ""}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.hint}>
              Processing happens on our servers using AssemblyAI
            </Text>
          </>
        )}
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
    paddingHorizontal: 24,
  },
  spinnerWrapper: {
    width: 140,
    height: 140,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
  },
  spinnerRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: "transparent",
    borderTopColor: Colors.accentLight,
    borderRightColor: Colors.accentLight,
  },
  spinnerContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.border,
  },
  spinnerComplete: {
    borderColor: Colors.success,
    backgroundColor: `${Colors.success}20`,
  },
  title: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: Colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 48,
    textAlign: "center",
  },
  hint: {
    marginTop: 32,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
  },
  steps: {
    width: "100%",
    maxWidth: 300,
    gap: 16,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepIconDone: {
    backgroundColor: `${Colors.success}20`,
    borderColor: Colors.success,
  },
  stepIconActive: {
    backgroundColor: `${Colors.accentLight}20`,
    borderColor: Colors.accentLight,
  },
  stepLabel: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  stepLabelDone: {
    color: Colors.success,
  },
  stepLabelActive: {
    color: Colors.accentLight,
    fontWeight: "600" as const,
  },
  failedIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${Colors.error}20`,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
  },
  errorMessage: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  failedActions: {
    width: "100%",
    gap: 16,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accentLight,
    paddingVertical: 16,
    borderRadius: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  viewAnywayButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  viewAnywayText: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
});
