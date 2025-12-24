import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { X, ChevronDown, Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetingDetails, useMeetings } from "@/contexts/MeetingContext";
import Colors from "@/constants/colors";
import type { MeetingType } from "@/types";

export default function EditMeetingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: meeting } = useMeetingDetails(id || null);
  const { updateMeeting, isUpdating, meetingTypes } = useMeetings();

  const [title, setTitle] = useState(meeting?.title || "");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(meeting?.meeting_type_id || null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);

  // Update state when meeting data loads
  useEffect(() => {
    if (meeting) {
      setTitle(meeting.title);
      setSelectedTypeId(meeting.meeting_type_id || null);
    }
  }, [meeting]);

  const selectedType = selectedTypeId 
    ? meetingTypes.find(t => t.id === selectedTypeId) 
    : null;

  const handleSave = async () => {
    if (!id) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      await updateMeeting({
        meetingId: id,
        updates: { 
          title: title.trim() || "Untitled Meeting",
          meeting_type_id: selectedTypeId,
        },
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

  const handleSelectType = (type: MeetingType | null) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedTypeId(type?.id || null);
    setShowTypeSelector(false);
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

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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

          <View style={styles.section}>
            <Text style={styles.label}>Meeting Type</Text>
            <Pressable
              style={styles.typeSelector}
              onPress={() => setShowTypeSelector(!showTypeSelector)}
            >
              {selectedType ? (
                <View style={styles.selectedType}>
                  <View style={[styles.typeDot, { backgroundColor: selectedType.color }]} />
                  <Text style={styles.selectedTypeText}>{selectedType.name}</Text>
                </View>
              ) : (
                <Text style={styles.typePlaceholder}>Select a type (optional)</Text>
              )}
              <ChevronDown 
                size={20} 
                color={Colors.textMuted}
                style={showTypeSelector ? { transform: [{ rotate: '180deg' }] } : undefined}
              />
            </Pressable>

            {/* Type Options Dropdown */}
            {showTypeSelector && (
              <View style={styles.typeDropdown}>
                {/* No Type Option */}
                <Pressable
                  style={[
                    styles.typeOption,
                    selectedTypeId === null && styles.typeOptionSelected,
                  ]}
                  onPress={() => handleSelectType(null)}
                >
                  <View style={styles.typeOptionLeft}>
                    <View style={[styles.typeOptionDot, { backgroundColor: Colors.textMuted }]} />
                    <Text style={styles.typeOptionText}>No Type</Text>
                  </View>
                  {selectedTypeId === null && (
                    <Check size={18} color={Colors.accentLight} />
                  )}
                </Pressable>

                {/* Type Options */}
                {meetingTypes.map((type) => (
                  <Pressable
                    key={type.id}
                    style={[
                      styles.typeOption,
                      selectedTypeId === type.id && styles.typeOptionSelected,
                    ]}
                    onPress={() => handleSelectType(type)}
                  >
                    <View style={styles.typeOptionLeft}>
                      <View style={[styles.typeOptionDot, { backgroundColor: type.color }]} />
                      <Text style={styles.typeOptionText}>{type.name}</Text>
                    </View>
                    {selectedTypeId === type.id && (
                      <Check size={18} color={Colors.accentLight} />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

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
  typeSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectedType: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  typeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  selectedTypeText: {
    fontSize: 16,
    color: Colors.text,
  },
  typePlaceholder: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  typeDropdown: {
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  typeOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  typeOptionSelected: {
    backgroundColor: Colors.accentLight + "15",
  },
  typeOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  typeOptionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  typeOptionText: {
    fontSize: 16,
    color: Colors.text,
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
