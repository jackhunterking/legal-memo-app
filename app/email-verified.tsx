import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CheckCircle, ArrowRight } from "lucide-react-native";
import { successNotification, mediumImpact, errorNotification } from "@/lib/haptics";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";

export default function EmailVerifiedScreen() {
  const router = useRouter();
  const { hasCompletedOnboarding, createProfile, user, isLoading: authLoading } = useAuth();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const checkmarkAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Trigger success haptic
    if (Platform.OS !== "web") {
      successNotification();
    }

    // Animate in sequence
    Animated.sequence([
      // Scale up the circle
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      // Fade in the checkmark
      Animated.timing(checkmarkAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Fade in the text content
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      delay: 300,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim, fadeAnim, checkmarkAnim]);

  const handleContinue = async () => {
    if (Platform.OS !== "web") {
      mediumImpact();
    }

    // Wait for auth to finish loading
    if (authLoading) {
      console.log("[EmailVerified] Auth still loading, waiting...");
      return;
    }

    // If user has completed onboarding, go to home
    if (hasCompletedOnboarding) {
      console.log("[EmailVerified] Onboarding already completed, navigating to home");
      router.replace("/(tabs)/home");
      return;
    }

    // If no user, something is wrong - redirect to auth
    if (!user?.id) {
      console.error("[EmailVerified] No user found after email verification");
      if (Platform.OS !== "web") {
        errorNotification();
      }
      Alert.alert(
        "Session Error",
        "Unable to verify your session. Please sign in again.",
        [{ text: "OK", onPress: () => router.replace("/auth") }]
      );
      return;
    }

    // Create/update profile for the user (this marks onboarding as complete)
    setIsProcessing(true);
    setError(null);
    
    try {
      console.log("[EmailVerified] Completing onboarding for user:", user.id);
      
      // Small delay to ensure auth state is fully propagated
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await createProfile({
        userId: user.id,
        userEmail: user.email,
      });
      
      console.log("[EmailVerified] Profile created/updated successfully");
      router.replace("/(tabs)/home");
    } catch (err) {
      console.error("[EmailVerified] Error creating profile:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to complete setup";
      setError(errorMessage);
      
      if (Platform.OS !== "web") {
        errorNotification();
      }
      
      // If the error indicates the user doesn't exist, redirect to auth
      if (errorMessage.includes("sign out") || errorMessage.includes("sign up")) {
        Alert.alert(
          "Account Setup Issue",
          errorMessage,
          [{ text: "OK", onPress: () => router.replace("/auth") }]
        );
      } else {
        // For other errors, show message but allow retry
        Alert.alert(
          "Setup Error",
          "Unable to complete account setup. Please try again.",
          [{ text: "OK" }]
        );
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.animationContainer}>
          <Animated.View
            style={[
              styles.circleOuter,
              {
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <View style={styles.circleMiddle}>
              <View style={styles.circleInner}>
                <Animated.View style={{ opacity: checkmarkAnim }}>
                  <CheckCircle
                    size={64}
                    color={Colors.success}
                    strokeWidth={2}
                    fill="rgba(16, 185, 129, 0.2)"
                  />
                </Animated.View>
              </View>
            </View>
          </Animated.View>
        </View>

        <Animated.View style={[styles.textContainer, { opacity: fadeAnim }]}>
          <Text style={styles.title}>Email Verified!</Text>
          <Text style={styles.subtitle}>
            Your account has been successfully verified
          </Text>
          <Text style={styles.description}>
            You're all set to start using Legal Memo. Record your legal meetings
            and get instant transcriptions, summaries, and speaker attribution.
          </Text>
        </Animated.View>

        <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}
          <Pressable 
            style={[styles.button, (isProcessing || authLoading) && styles.buttonDisabled]} 
            onPress={handleContinue}
            disabled={isProcessing || authLoading}
          >
            {isProcessing ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <>
                <Text style={styles.buttonText}>Continue to App</Text>
                <ArrowRight size={20} color={Colors.text} />
              </>
            )}
          </Pressable>
        </Animated.View>
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
    justifyContent: "center",
  },
  animationContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  circleOuter: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  circleMiddle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  circleInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(16, 185, 129, 0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    alignItems: "center",
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "700" as const,
    color: Colors.text,
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "500" as const,
    color: Colors.success,
    marginBottom: 20,
    textAlign: "center",
  },
  description: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  footer: {
    marginTop: 48,
    paddingHorizontal: 16,
  },
  button: {
    backgroundColor: Colors.accentLight,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  errorText: {
    fontSize: 14,
    color: Colors.error,
    textAlign: "center",
    marginBottom: 12,
  },
});

