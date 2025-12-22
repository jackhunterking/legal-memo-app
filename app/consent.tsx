import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Shield, CheckCircle, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetings } from "@/contexts/MeetingContext";
import Colors from "@/constants/colors";

export default function ConsentScreen() {
  const router = useRouter();
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const { confirmConsent, deleteMeeting } = useMeetings();

  const [informedParticipants, setInformedParticipants] = useState(false);
  const [recordingLawful, setRecordingLawful] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canProceed = informedParticipants && recordingLawful;

  const handleToggle = (setter: (val: boolean) => void, current: boolean) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setter(!current);
  };

  const handleStart = async () => {
    if (!meetingId || !canProceed) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setIsSubmitting(true);
    try {
      await confirmConsent({
        meetingId,
        informedParticipants,
        recordingLawful,
      });
      router.replace({ pathname: "/recording", params: { meetingId } });
    } catch (err) {
      console.error("[Consent] Error:", err);
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (meetingId) {
      try {
        await deleteMeeting(meetingId);
      } catch (err) {
        console.error("[Consent] Delete error:", err);
      }
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Shield size={48} color={Colors.accentLight} strokeWidth={1.5} />
        </View>
        <Text style={styles.title}>Recording Consent</Text>
        <Text style={styles.subtitle}>
          Please confirm before recording
        </Text>
      </View>

      <View style={styles.checkboxes}>
        <Pressable
          style={styles.checkboxRow}
          onPress={() => handleToggle(setInformedParticipants, informedParticipants)}
        >
          <View style={[styles.checkbox, informedParticipants && styles.checkboxChecked]}>
            {informedParticipants && <CheckCircle size={20} color={Colors.text} />}
          </View>
          <Text style={styles.checkboxLabel}>
            I have informed all participants that this meeting will be recorded
          </Text>
        </Pressable>

        <Pressable
          style={styles.checkboxRow}
          onPress={() => handleToggle(setRecordingLawful, recordingLawful)}
        >
          <View style={[styles.checkbox, recordingLawful && styles.checkboxChecked]}>
            {recordingLawful && <CheckCircle size={20} color={Colors.text} />}
          </View>
          <Text style={styles.checkboxLabel}>
            This recording is lawful in my jurisdiction
          </Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={[styles.startButton, (!canProceed || isSubmitting) && styles.buttonDisabled]}
          onPress={handleStart}
          disabled={!canProceed || isSubmitting}
        >
          <Text style={styles.startButtonText}>
            {isSubmitting ? "Starting..." : "Start Recording"}
          </Text>
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={handleCancel}>
          <X size={16} color={Colors.textMuted} />
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 32,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  checkboxes: {
    flex: 1,
    gap: 20,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
  },
  footer: {
    paddingBottom: 24,
    gap: 16,
  },
  startButton: {
    backgroundColor: Colors.accentLight,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  cancelButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 16,
    color: Colors.textMuted,
  },
});
