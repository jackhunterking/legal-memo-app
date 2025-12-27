import { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mic, User, Users, Crown, Clock, Infinity } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetings } from "@/contexts/MeetingContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUsage } from "@/contexts/UsageContext";
import Colors from "@/constants/colors";

// Meeting type options: 1 = Solo, 2 = Two People, 3 = Three or more
type ExpectedSpeakers = 1 | 2 | 3;

export default function HomeScreen() {
  const router = useRouter();
  const { createMeeting, isCreating } = useMeetings();
  useAuth();
  const { 
    canRecord, 
    isTrialExpired,
    hasActiveSubscription,
    hasActiveTrial,
    trialDaysRemaining,
    refreshCanRecord,
  } = useUsage();
  
  // Default to 2 people (most common meeting scenario)
  const [expectedSpeakers, setExpectedSpeakers] = useState<ExpectedSpeakers>(2);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Refresh can record status when screen comes into focus
  useEffect(() => {
    refreshCanRecord();
  }, []);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const handleStartRecording = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }

    // Check if user can record
    if (!canRecord) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      
      // Navigate to subscription page
      router.push("/subscription");
      return;
    }

    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      // Pass expected speakers for diarization configuration
      const meeting = await createMeeting(expectedSpeakers);
      router.push({ pathname: "/recording", params: { meetingId: meeting.id } });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[Home] Failed to create meeting:", errorMessage);
      alert(`Failed to start recording: ${errorMessage}`);
    }
  };

  const handleSpeakerSelect = (speakers: ExpectedSpeakers) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpectedSpeakers(speakers);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Start Recording</Text>
        
        {/* Subscription Status Badge */}
        {hasActiveSubscription ? (
          <View style={styles.proBadge}>
            <Crown size={14} color="#FFD700" />
            <Text style={styles.proBadgeText}>PRO</Text>
            <View style={styles.badgeDivider} />
            <Infinity size={14} color="#10B981" />
            <Text style={styles.unlimitedText}>Unlimited</Text>
          </View>
        ) : hasActiveTrial && !isTrialExpired ? (
          <View style={[styles.trialBadge, trialDaysRemaining <= 2 && styles.trialBadgeUrgent]}>
            <Clock size={14} color={trialDaysRemaining <= 2 ? Colors.warning : Colors.accent} />
            <Text style={[styles.trialBadgeText, trialDaysRemaining <= 2 && styles.trialBadgeTextUrgent]}>
              {trialDaysRemaining === 0 
                ? 'Trial ends today' 
                : trialDaysRemaining === 1 
                  ? 'Trial ends tomorrow'
                  : `${trialDaysRemaining} days left`}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Meeting Type Selector */}
      <View style={styles.meetingTypeSection}>
        <Text style={styles.meetingTypeLabel}>Number of Speakers</Text>
        <View style={styles.meetingTypeButtons}>
          <TouchableOpacity
            style={[
              styles.meetingTypeButton,
              styles.meetingTypeButtonLeft,
              expectedSpeakers === 1 && styles.meetingTypeButtonActive,
            ]}
            onPress={() => handleSpeakerSelect(1)}
            activeOpacity={0.7}
          >
            <User 
              size={18} 
              color={expectedSpeakers === 1 ? Colors.text : Colors.textMuted} 
              strokeWidth={2}
            />
            <Text
              style={[
                styles.meetingTypeButtonText,
                expectedSpeakers === 1 && styles.meetingTypeButtonTextActive,
              ]}
            >
              Solo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.meetingTypeButton,
              expectedSpeakers === 2 && styles.meetingTypeButtonActive,
            ]}
            onPress={() => handleSpeakerSelect(2)}
            activeOpacity={0.7}
          >
            <Users 
              size={18} 
              color={expectedSpeakers === 2 ? Colors.text : Colors.textMuted}
              strokeWidth={2}
            />
            <Text
              style={[
                styles.meetingTypeButtonText,
                expectedSpeakers === 2 && styles.meetingTypeButtonTextActive,
              ]}
            >
              2 People
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.meetingTypeButton,
              styles.meetingTypeButtonRight,
              expectedSpeakers === 3 && styles.meetingTypeButtonActive,
            ]}
            onPress={() => handleSpeakerSelect(3)}
            activeOpacity={0.7}
          >
            <Users 
              size={18} 
              color={expectedSpeakers === 3 ? Colors.text : Colors.textMuted}
              strokeWidth={2}
            />
            <Text
              style={[
                styles.meetingTypeButtonText,
                expectedSpeakers === 3 && styles.meetingTypeButtonTextActive,
              ]}
            >
              3+
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.recordSection}>
        <View style={styles.buttonContainer}>
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: pulseAnim }],
                opacity: pulseAnim.interpolate({
                  inputRange: [1, 1.2],
                  outputRange: [0.6, 0],
                }),
              },
              // Dim the pulse ring if trial expired
              isTrialExpired && { opacity: 0.2 },
            ]}
          />
          <Animated.View style={[styles.buttonWrapper, { transform: [{ scale: scaleAnim }] }]}>
            <Pressable
              style={[
                styles.recordButton, 
                isCreating && styles.recordButtonDisabled,
                isTrialExpired && styles.recordButtonLocked,
              ]}
              onPress={handleStartRecording}
              disabled={isCreating}
            >
              <Mic size={56} color={Colors.text} strokeWidth={2.5} />
            </Pressable>
          </Animated.View>
        </View>
        <Text style={styles.recordHint}>
          {isTrialExpired 
            ? 'Subscribe to start recording' 
            : 'Tap to begin recording'}
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
  header: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.text,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  // PRO subscription badge
  proBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  proBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFD700",
    letterSpacing: 0.5,
  },
  badgeDivider: {
    width: 1,
    height: 14,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    marginHorizontal: 4,
  },
  unlimitedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10B981",
  },
  // Trial badge
  trialBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${Colors.accent}15`,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: `${Colors.accent}30`,
  },
  trialBadgeUrgent: {
    backgroundColor: `${Colors.warning}15`,
    borderColor: `${Colors.warning}30`,
  },
  trialBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.accent,
  },
  trialBadgeTextUrgent: {
    color: Colors.warning,
  },
  meetingTypeSection: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  meetingTypeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textMuted,
    textAlign: "center",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  meetingTypeButtons: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
  },
  meetingTypeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
    borderRadius: 8,
  },
  meetingTypeButtonLeft: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  meetingTypeButtonRight: {
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  meetingTypeButtonActive: {
    backgroundColor: Colors.accentLight,
  },
  meetingTypeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textMuted,
  },
  meetingTypeButtonTextActive: {
    color: Colors.text,
  },
  recordSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  buttonContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 220,
    height: 220,
  },
  pulseRing: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: Colors.accentLight,
  },
  buttonWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  recordButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.accentLight,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: Colors.accentLight,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
  recordButtonDisabled: {
    opacity: 0.6,
  },
  recordButtonLocked: {
    backgroundColor: Colors.surfaceLight,
    shadowOpacity: 0.2,
  },
  recordHint: {
    marginTop: 8,
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: "center",
  },
});
