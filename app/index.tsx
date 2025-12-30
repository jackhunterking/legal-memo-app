import { useEffect, useState, useRef } from "react";
import { View, ActivityIndicator, StyleSheet, Dimensions, Image } from "react-native";
import { useRouter, useRootNavigationState } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/contexts/AuthContext";
import { useAppConfig } from "@/contexts/AppConfigContext";
import Colors from "@/constants/colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function IndexScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { 
    isAuthenticated, 
    hasCompletedOnboarding, 
    isAuthLoading, 
    isProfileLoading,
    isFullyLoaded,
    profile,
    user,
    updateProfile,
  } = useAuth();
  const { needsForceUpdate, isLoading: configLoading } = useAppConfig();

  // Track if we're currently auto-completing onboarding to prevent loops
  const [isAutoCompletingOnboarding, setIsAutoCompletingOnboarding] = useState(false);
  const autoCompleteAttemptedRef = useRef(false);

  // Wait for auth to complete first, then profile if authenticated
  // This prevents premature routing decisions
  const isLoading = isAuthLoading || configLoading || (isAuthenticated && isProfileLoading) || isAutoCompletingOnboarding;

  useEffect(() => {
    if (isLoading) {
      console.log("[Index] Still loading...", { isAuthLoading, configLoading, isProfileLoading, isAuthenticated, isAutoCompletingOnboarding });
      return;
    }
    
    // Wait for navigation state to be ready before navigating
    if (!rootNavigationState?.key) {
      console.log("[Index] Navigation not ready yet, waiting...");
      return;
    }

    console.log("[Index] Routing state:", { 
      isAuthenticated, 
      hasCompletedOnboarding,
      needsForceUpdate,
      isFullyLoaded,
      hasProfile: !!profile,
      userId: user?.id,
    });

    // Force update takes priority over everything else
    if (needsForceUpdate) {
      console.log("[Index] Force update required, redirecting...");
      router.replace("/force-update");
      return;
    }

    // Check for stale session - authenticated but no profile
    // AuthContext will auto-signout, so wait for that to happen
    if (isAuthenticated && !profile && !isProfileLoading) {
      console.log("[Index] Possible stale session detected - authenticated but no profile. Waiting for auto-signout...");
      // Don't navigate yet - let AuthContext handle the stale session
      return;
    }

    // Normal routing flow
    if (!isAuthenticated) {
      // Not logged in - show onboarding intro slides
      console.log("[Index] Not authenticated, redirecting to onboarding...");
      router.replace("/onboarding");
    } else if (!hasCompletedOnboarding) {
      // FIX: Authenticated user with incomplete onboarding - auto-complete it
      // This fixes the login loop where users were sent to intro slides repeatedly
      // The user is already logged in, so they don't need to see intro slides
      if (autoCompleteAttemptedRef.current) {
        // If we already tried to auto-complete and still showing incomplete, 
        // just go to home to avoid infinite loop
        console.log("[Index] Auto-complete already attempted, going to home anyway...");
        router.replace("/(tabs)/home");
        return;
      }
      
      console.log("[Index] Authenticated but onboarding not completed - auto-completing...");
      autoCompleteAttemptedRef.current = true;
      setIsAutoCompletingOnboarding(true);
      
      updateProfile({ onboarding_completed: true })
        .then(() => {
          console.log("[Index] Onboarding auto-completed successfully, going to home...");
          router.replace("/(tabs)/home");
        })
        .catch((err) => {
          console.error("[Index] Failed to auto-complete onboarding:", err);
          // Even if update fails, go to home to prevent loop
          router.replace("/(tabs)/home");
        })
        .finally(() => {
          setIsAutoCompletingOnboarding(false);
        });
    } else {
      // Logged in and completed onboarding - go to home
      console.log("[Index] Fully authenticated with completed onboarding, going to home...");
      router.replace("/(tabs)/home");
    }
  }, [isAuthenticated, hasCompletedOnboarding, needsForceUpdate, isLoading, router, rootNavigationState?.key, isFullyLoaded, isAuthLoading, configLoading, isProfileLoading, profile, user?.id, updateProfile]);

  return (
    <LinearGradient
      colors={["#061f18", "#051a14", "#08080e"]}
      style={styles.container}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.logoContainer}>
        <Image
          source={require("@/assets/images/icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <ActivityIndicator size="large" color={Colors.accentLight} style={styles.loader} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logoContainer: {
    width: SCREEN_WIDTH * 0.6, // 60% of screen width (20% margin on each side)
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: "100%",
    height: "100%",
  },
  loader: {
    marginTop: 40,
  },
});
