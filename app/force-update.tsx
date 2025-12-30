/**
 * Force Update Screen
 * 
 * A blocking screen that requires users to update their app before continuing.
 * Shows when the user's app version is below the minimum required version.
 * 
 * Features:
 * - Cannot be dismissed or navigated away from
 * - Shows current vs required version
 * - Links to App Store (iOS) and Play Store (Android)
 * - Custom message from database config
 */

import { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  Platform,
  Image,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Download, RefreshCw, AlertTriangle } from "lucide-react-native";
import { useAppConfig } from "@/contexts/AppConfigContext";
import { mediumImpact } from "@/lib/haptics";
import Colors from "@/constants/colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Store URLs - Update these when the app is published
const STORE_URLS = {
  ios: "https://apps.apple.com/app/legal-memo/id", // Add App Store ID when available
  android: "https://play.google.com/store/apps/details?id=app.rork.legal_memo",
};

export default function ForceUpdateScreen() {
  const {
    currentVersion,
    minimumVersion,
    forceUpdateMessage,
    refreshConfig,
  } = useAppConfig();

  /**
   * Open the appropriate app store based on platform
   */
  const handleUpdatePress = useCallback(async () => {
    if (Platform.OS !== "web") {
      mediumImpact();
    }

    const storeUrl = Platform.select({
      ios: STORE_URLS.ios,
      android: STORE_URLS.android,
      default: STORE_URLS.ios,
    });

    try {
      const canOpen = await Linking.canOpenURL(storeUrl);
      if (canOpen) {
        await Linking.openURL(storeUrl);
      } else {
        console.error("[ForceUpdate] Cannot open store URL:", storeUrl);
      }
    } catch (error) {
      console.error("[ForceUpdate] Error opening store:", error);
    }
  }, []);

  /**
   * Refresh config to check if update requirement has been removed
   */
  const handleRefresh = useCallback(async () => {
    if (Platform.OS !== "web") {
      mediumImpact();
    }
    await refreshConfig();
  }, [refreshConfig]);

  return (
    <LinearGradient
      colors={["#1a0a0a", "#0d0d12", "#08080e"]}
      style={styles.container}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.content}>
          {/* Warning Icon */}
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={["#FF6B6B", "#EE5A5A"]}
              style={styles.iconGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <AlertTriangle size={48} color="#fff" strokeWidth={1.5} />
            </LinearGradient>
          </View>

          {/* Title */}
          <Text style={styles.title}>Update Required</Text>

          {/* Message */}
          <Text style={styles.message}>{forceUpdateMessage}</Text>

          {/* Version Info Card */}
          <View style={styles.versionCard}>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Your Version</Text>
              <Text style={styles.versionValueOld}>v{currentVersion}</Text>
            </View>
            <View style={styles.versionDivider} />
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Required Version</Text>
              <Text style={styles.versionValueNew}>v{minimumVersion}+</Text>
            </View>
          </View>

          {/* Why Update Section */}
          <View style={styles.whySection}>
            <Text style={styles.whyTitle}>Why update?</Text>
            <Text style={styles.whyText}>
              This update contains critical improvements and security fixes that ensure the best experience for your legal practice.
            </Text>
          </View>

          {/* Update Button */}
          <Pressable style={styles.updateButton} onPress={handleUpdatePress}>
            <Download size={22} color="#fff" />
            <Text style={styles.updateButtonText}>
              {Platform.OS === "ios" ? "Update on App Store" : "Update on Play Store"}
            </Text>
          </Pressable>

          {/* Refresh Button */}
          <Pressable style={styles.refreshButton} onPress={handleRefresh}>
            <RefreshCw size={18} color={Colors.textMuted} />
            <Text style={styles.refreshButtonText}>
              I&apos;ve already updated
            </Text>
          </Pressable>

          {/* Footer */}
          <Text style={styles.footer}>
            Thank you for keeping Legal Memo up to date.
          </Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: 24,
  },
  iconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FF6B6B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  versionCard: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  versionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  versionLabel: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  versionValueOld: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FF6B6B",
  },
  versionValueNew: {
    fontSize: 16,
    fontWeight: "600",
    color: "#10B981",
  },
  versionDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginVertical: 16,
  },
  whySection: {
    width: "100%",
    marginBottom: 32,
  },
  whyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  whyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  updateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#10B981",
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: "100%",
    marginBottom: 16,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  updateButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  refreshButtonText: {
    fontSize: 15,
    color: Colors.textMuted,
    fontWeight: "500",
  },
  footer: {
    position: "absolute",
    bottom: 32,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
  },
});

