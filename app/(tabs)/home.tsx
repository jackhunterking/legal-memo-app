import { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mic } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetings } from "@/contexts/MeetingContext";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";

export default function HomeScreen() {
  const router = useRouter();
  const { createInstantMeeting, isCreating } = useMeetings();
  useAuth();
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

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
      const meeting = await createInstantMeeting();
      router.push({ pathname: "/consent", params: { meetingId: meeting.id } });
    } catch (err: any) {
      const errorMessage = err?.message || JSON.stringify(err);
      console.error("[Home] Failed to create meeting:", errorMessage);
      alert(`Failed to start recording: ${errorMessage}`);
    }
  };



  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Start Recording</Text>
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
            ]}
          />
          <Animated.View style={[styles.buttonWrapper, { transform: [{ scale: scaleAnim }] }]}>
            <Pressable
              style={[styles.recordButton, isCreating && styles.recordButtonDisabled]}
              onPress={handleStartRecording}
              disabled={isCreating}
            >
              <Mic size={56} color={Colors.text} strokeWidth={2.5} />
            </Pressable>
          </Animated.View>
        </View>
        <Text style={styles.recordHint}>Tap to begin recording</Text>
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
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: Colors.text,
    letterSpacing: -0.5,
    textAlign: "center",
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
  recordHint: {
    marginTop: 8,
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: "center",
  },
});
