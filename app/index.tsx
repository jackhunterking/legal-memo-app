import { useEffect } from "react";
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
  const { isAuthenticated, hasCompletedOnboarding, isLoading: authLoading } = useAuth();
  const { needsForceUpdate, isLoading: configLoading } = useAppConfig();

  // Combined loading state
  const isLoading = authLoading || configLoading;

  useEffect(() => {
    if (isLoading) return;
    
    // Wait for navigation state to be ready before navigating
    if (!rootNavigationState?.key) {
      console.log("[Index] Navigation not ready yet, waiting...");
      return;
    }

    console.log("[Index] Routing state:", { 
      isAuthenticated, 
      hasCompletedOnboarding,
      needsForceUpdate,
    });

    // Force update takes priority over everything else
    if (needsForceUpdate) {
      console.log("[Index] Force update required, redirecting...");
      router.replace("/force-update");
      return;
    }

    // Normal routing flow
    if (!isAuthenticated) {
      // Not logged in - show onboarding intro slides
      router.replace("/onboarding");
    } else {
      // Logged in - go directly to home
      router.replace("/(tabs)/home");
    }
  }, [isAuthenticated, hasCompletedOnboarding, needsForceUpdate, isLoading, router, rootNavigationState?.key]);

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
