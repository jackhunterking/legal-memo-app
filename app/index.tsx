import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";

export default function IndexScreen() {
  const router = useRouter();
  const { isAuthenticated, hasCompletedOnboarding, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    console.log("[Index] Auth state:", { isAuthenticated, hasCompletedOnboarding });

    if (!isAuthenticated) {
      router.replace("/onboarding");
    } else if (!hasCompletedOnboarding) {
      router.replace("/onboarding");
    } else {
      router.replace("/(tabs)/home");
    }
  }, [isAuthenticated, hasCompletedOnboarding, isLoading, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.accentLight} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
});
