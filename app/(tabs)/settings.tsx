import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Switch,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { DollarSign, LogOut, Trash2, ChevronRight, Info, MessageCircleHeart, Send, Fingerprint } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { isBiometricSupported, getBiometricType, isBiometricEnabled, setBiometricEnabled } from "@/lib/biometrics";

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, updateProfile, signOut, user, isSigningOut } = useAuth();

  const [hourlyRate, setHourlyRate] = useState(
    (profile?.default_hourly_rate ?? 250).toString()
  );
  const [defaultBillable, setDefaultBillable] = useState(
    profile?.last_billable_setting ?? false
  );

  const [featureRequest, setFeatureRequest] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);

  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricType, setBiometricType] = useState<string | null>(null);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);

  useEffect(() => {
    const checkBiometric = async () => {
      const supported = await isBiometricSupported();
      setBiometricSupported(supported);
      
      if (supported) {
        const type = await getBiometricType();
        setBiometricType(type);
        const enabled = await isBiometricEnabled();
        setBiometricEnabledState(enabled);
      }
    };
    
    checkBiometric();
  }, []);

  const handleSaveRate = async () => {
    const rate = parseFloat(hourlyRate);
    if (isNaN(rate) || rate < 0) {
      Alert.alert("Invalid Rate", "Please enter a valid hourly rate.");
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      await updateProfile({ default_hourly_rate: rate });
    } catch (err) {
      console.error("[Settings] Update rate error:", err);
    }
  };

  const handleToggleBillable = async (value: boolean) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setDefaultBillable(value);
    try {
      await updateProfile({ last_billable_setting: value });
    } catch (err) {
      console.error("[Settings] Update billable error:", err);
    }
  };

  const handleToggleBiometric = async (value: boolean) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      await setBiometricEnabled(value);
      setBiometricEnabledState(value);
      
      if (!value) {
        Alert.alert(
          "Biometric Login Disabled",
          "You'll need to enter your password on next login."
        );
      } else {
        Alert.alert(
          "Biometric Login Enabled",
          "You can now use " + (biometricType || "biometric") + " to sign in quickly."
        );
      }
    } catch (err) {
      console.error("[Settings] Toggle biometric error:", err);
      Alert.alert("Error", "Could not update biometric settings.");
    }
  };

  const handleSignOut = async () => {
    const performSignOut = async () => {
      try {
        await signOut();
        router.replace("/onboarding");
      } catch (err) {
        console.error("[Settings] Sign out error:", err);
      }
    };

    if (Platform.OS === "web") {
      performSignOut();
    } else {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", onPress: performSignOut },
      ]);
    }
  };

  const handleSubmitFeatureRequest = async () => {
    if (!featureRequest.trim()) {
      Alert.alert(
        "Oops!",
        "Please write down your idea before sending it to us."
      );
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setIsSubmitting(true);

    // Simulate sending (in production, this would send to your backend)
    setTimeout(() => {
      console.log("[Settings] Feature request submitted:", featureRequest);
      setIsSubmitting(false);
      setFeatureRequest("");
      setShowThankYou(true);

      setTimeout(() => setShowThankYou(false), 4000);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, 1000);
  };

  const handleDeleteAccount = () => {
    const message =
      "This will permanently delete your account and all meeting data. This action cannot be undone.";

    if (Platform.OS === "web") {
      alert(message + "\n\nPlease contact support to delete your account.");
    } else {
      Alert.alert("Delete Account", message, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Contact Support",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Contact Support",
              "Please email support@example.com to request account deletion."
            );
          },
        },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Settings</Text>
        
        <Text style={styles.sectionTitle}>Billing Defaults</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <DollarSign size={20} color={Colors.accentLight} />
              <Text style={styles.settingLabel}>Default Hourly Rate</Text>
            </View>
            <View style={styles.rateInput}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.rateTextInput}
                value={hourlyRate}
                onChangeText={setHourlyRate}
                keyboardType="decimal-pad"
                onBlur={handleSaveRate}
              />
              <Text style={styles.rateUnit}>/hr</Text>
            </View>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Text style={styles.settingLabel}>Default to Billable</Text>
            </View>
            <Switch
              value={defaultBillable}
              onValueChange={handleToggleBillable}
              trackColor={{ false: Colors.surfaceLight, true: Colors.accentLight }}
              thumbColor={Colors.text}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.section}>
          {biometricSupported && (
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Fingerprint size={20} color={Colors.accentLight} />
                <View>
                  <Text style={styles.settingLabel}>{biometricType || "Biometric"} Login</Text>
                  <Text style={styles.settingHint}>Quick and secure sign in</Text>
                </View>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleToggleBiometric}
                trackColor={{ false: Colors.surfaceLight, true: Colors.accentLight }}
                thumbColor={Colors.text}
              />
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Email</Text>
            <Text style={styles.settingValue}>{user?.email || "—"}</Text>
          </View>

          <Pressable
            style={[styles.settingRow, styles.pressableRow]}
            onPress={handleSignOut}
            disabled={isSigningOut}
          >
            <View style={styles.settingLeft}>
              <LogOut size={20} color={Colors.textSecondary} />
              <Text style={styles.settingLabel}>Sign Out</Text>
            </View>
            <ChevronRight size={20} color={Colors.textMuted} />
          </Pressable>

          <Pressable
            style={[styles.settingRow, styles.pressableRow, styles.dangerRow]}
            onPress={handleDeleteAccount}
          >
            <View style={styles.settingLeft}>
              <Trash2 size={20} color={Colors.error} />
              <Text style={[styles.settingLabel, styles.dangerText]}>
                Delete Account
              </Text>
            </View>
            <ChevronRight size={20} color={Colors.error} />
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Info size={20} color={Colors.textMuted} />
              <Text style={styles.settingLabel}>Version</Text>
            </View>
            <Text style={styles.settingValue}>1.0.0</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>We&apos;d Love to Hear From You</Text>
        <View style={styles.featureSection}>
          <View style={styles.featureHeader}>
            <MessageCircleHeart size={28} color={Colors.accent} />
            <Text style={styles.featureTitle}>Got an idea? Tell us!</Text>
          </View>
          <Text style={styles.featureDescription}>
            Is there something you wish this app could do? We&apos;re always looking for ways to make things easier for you. Just write it down below — no tech talk needed!
          </Text>
          
          {showThankYou ? (
            <View style={styles.thankYouBox}>
              <Text style={styles.thankYouText}>🎉 Thank you so much!</Text>
              <Text style={styles.thankYouSubtext}>
                We got your idea and we really appreciate you taking the time to share it with us.
              </Text>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.featureInput}
                placeholder="For example: I'd love a way to share recordings with my family..."
                placeholderTextColor={Colors.textMuted}
                value={featureRequest}
                onChangeText={setFeatureRequest}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <Pressable
                style={({ pressed }) => [
                  styles.submitButton,
                  pressed && styles.submitButtonPressed,
                  isSubmitting && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmitFeatureRequest}
                disabled={isSubmitting}
              >
                <Send size={18} color={Colors.text} />
                <Text style={styles.submitButtonText}>
                  {isSubmitting ? "Sending..." : "Send My Idea"}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        <Text style={styles.disclaimer}>
          Legal Meeting Intelligence uses AI to generate summaries. AI-generated
          content may contain errors and should not be relied upon as legal
          advice. Always verify important information independently.
        </Text>
      </ScrollView>
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
    paddingHorizontal: 20,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: "700" as const,
    color: Colors.text,
    letterSpacing: -0.5,
    paddingHorizontal: 4,
    marginTop: 12,
    marginBottom: 8,
  },
  section: {
    marginBottom: 28,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 4,
    marginTop: 28,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pressableRow: {
    cursor: "pointer" as const,
  },
  dangerRow: {
    borderBottomWidth: 0,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: Colors.text,
  },
  settingHint: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  settingValue: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  dangerText: {
    color: Colors.error,
  },
  rateInput: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  currencySymbol: {
    fontSize: 17,
    fontWeight: "600" as const,
    color: Colors.text,
    marginRight: 2,
  },
  rateTextInput: {
    fontSize: 17,
    fontWeight: "600" as const,
    color: Colors.text,
    minWidth: 70,
    textAlign: "right",
    padding: 0,
  },
  rateUnit: {
    fontSize: 15,
    color: Colors.textMuted,
    marginLeft: 2,
  },
  disclaimer: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  featureSection: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  featureHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 20,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  featureDescription: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 16,
  },
  featureInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 100,
    marginBottom: 14,
  },
  submitButton: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  submitButtonPressed: {
    opacity: 0.85,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  thankYouBox: {
    backgroundColor: "rgba(52, 199, 89, 0.15)",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },
  thankYouText: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: Colors.success || "#34C759",
    marginBottom: 8,
  },
  thankYouSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
