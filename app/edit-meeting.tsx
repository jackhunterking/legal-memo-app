import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetingDetails, useMeetings } from "@/contexts/MeetingContext";
import Colors from "@/constants/colors";

export default function EditMeetingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: meeting } = useMeetingDetails(id || null);
  const { updateMeeting, isUpdating } = useMeetings();

  const [title, setTitle] = useState(meeting?.title || "");

  const handleSave = async () => {
    if (!id) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      await updateMeeting({
        meetingId: id,
        updates: { title: title.trim() || "Untitled Meeting" },
      });
      router.back();
    } catch (err) {
      console.error("[EditMeeting] Error updating meeting:", err);
    }
  };

  const handleCancel = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  };

  if (!meeting) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable style={styles.cancelButton} onPress={handleCancel}>
            <X size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Edit Meeting</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Meeting title"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            style={[styles.saveButton, isUpdating && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isUpdating}
          >
            <Text style={styles.saveButtonText}>
              {isUpdating ? "Saving..." : "Save Changes"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  cancelButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 10,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  saveButton: {
    backgroundColor: Colors.accentLight,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.text,
  },
});
