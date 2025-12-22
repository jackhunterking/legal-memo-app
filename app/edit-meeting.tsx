import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { X, User } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetingDetails, useMeetings } from "@/contexts/MeetingContext";
import { useMeetingTypes } from "@/contexts/MeetingTypeContext";
import { useContacts } from "@/contexts/ContactContext";
import type { Contact } from "@/types";
import Colors from "@/constants/colors";

export default function EditMeetingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: meeting } = useMeetingDetails(id || null);
  const { updateMeetingDetails, isUpdating } = useMeetings();
  const { meetingTypes } = useMeetingTypes();
  const { contacts } = useContacts();

  const [title, setTitle] = useState(meeting?.title_override || meeting?.auto_title || "");
  const [meetingTypeId, setMeetingTypeId] = useState<string | null>(
    meeting?.meeting_type_id || null
  );
  const [clientName, setClientName] = useState(meeting?.client_name || "");
  const [contactId, setContactId] = useState<string | null>(
    meeting?.primary_contact_id || null
  );
  const [billable, setBillable] = useState(meeting?.billable || false);
  const [hourlyRate, setHourlyRate] = useState(
    (meeting?.hourly_rate_snapshot || 250).toString()
  );
  const [showContactPicker, setShowContactPicker] = useState(false);

  const selectedContact = contacts.find((c) => c.id === contactId);

  const handleSave = async () => {
    if (!id) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      await updateMeetingDetails(id, {
        title_override: title.trim() || null,
        meeting_type_id: meetingTypeId,
        client_name: clientName.trim() || null,
        primary_contact_id: contactId,
        billable,
        hourly_rate_snapshot: parseFloat(hourlyRate) || 250,
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

  const handleSelectContact = (contact: Contact | null) => {
    setContactId(contact?.id || null);
    if (contact) {
      setClientName(contact.full_name);
    }
    setShowContactPicker(false);
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
          <Text style={styles.title}>Edit Meeting</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={meeting.auto_title}
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Meeting Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.typeButtons}>
                {meetingTypes.map((type) => (
                  <Pressable
                    key={type.id}
                    style={[
                      styles.typeButton,
                      meetingTypeId === type.id && styles.typeButtonActive,
                      meetingTypeId === type.id && { borderColor: type.color },
                    ]}
                    onPress={() => setMeetingTypeId(type.id)}
                  >
                    <View style={[styles.typeDot, { backgroundColor: type.color }]} />
                    <Text
                      style={[
                        styles.typeButtonText,
                        meetingTypeId === type.id && styles.typeButtonTextActive,
                      ]}
                    >
                      {type.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Contact</Text>
            <Pressable
              style={styles.contactSelector}
              onPress={() => setShowContactPicker(!showContactPicker)}
            >
              <User size={18} color={Colors.textMuted} />
              <Text
                style={[
                  styles.contactSelectorText,
                  !selectedContact && styles.contactSelectorPlaceholder,
                ]}
              >
                {selectedContact ? selectedContact.full_name : "Select a contact"}
              </Text>
            </Pressable>

            {showContactPicker && (
              <View style={styles.contactPicker}>
                <Pressable
                  style={styles.contactOption}
                  onPress={() => handleSelectContact(null)}
                >
                  <Text style={styles.contactOptionText}>None</Text>
                </Pressable>
                {contacts.map((contact) => (
                  <Pressable
                    key={contact.id}
                    style={[
                      styles.contactOption,
                      contactId === contact.id && styles.contactOptionSelected,
                    ]}
                    onPress={() => handleSelectContact(contact)}
                  >
                    <Text style={styles.contactOptionText}>{contact.full_name}</Text>
                    <Text style={styles.contactOptionRole}>{contact.role}</Text>
                  </Pressable>
                ))}
                {contacts.length === 0 && (
                  <View style={styles.contactOption}>
                    <Text style={styles.contactOptionText}>No contacts available</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Client Name (optional)</Text>
            <TextInput
              style={styles.input}
              value={clientName}
              onChangeText={setClientName}
              placeholder="e.g. John Smith"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.settingRow}>
              <Text style={styles.label}>Billable</Text>
              <Switch
                value={billable}
                onValueChange={setBillable}
                trackColor={{ false: Colors.surfaceLight, true: Colors.accentLight }}
                thumbColor={Colors.text}
              />
            </View>
          </View>

          {billable && (
            <View style={styles.section}>
              <Text style={styles.label}>Hourly Rate</Text>
              <View style={styles.rateInput}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.rateTextInput}
                  value={hourlyRate}
                  onChangeText={setHourlyRate}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.rateUnit}>/hr</Text>
              </View>
            </View>
          )}
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
  title: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: "600" as const,
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
  typeButtons: {
    flexDirection: "row",
    gap: 10,
  },
  typeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeButtonActive: {
    backgroundColor: Colors.accentLight,
    borderColor: Colors.accentLight,
  },
  typeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.textSecondary,
  },
  typeButtonTextActive: {
    color: Colors.text,
  },
  contactSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  contactSelectorText: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  contactSelectorPlaceholder: {
    color: Colors.textMuted,
  },
  contactPicker: {
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  contactOption: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  contactOptionSelected: {
    backgroundColor: `${Colors.accentLight}20`,
  },
  contactOptionText: {
    fontSize: 15,
    color: Colors.text,
    marginBottom: 2,
  },
  contactOptionRole: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rateInput: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  currencySymbol: {
    fontSize: 17,
    fontWeight: "600" as const,
    color: Colors.text,
    marginRight: 4,
  },
  rateTextInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600" as const,
    color: Colors.text,
    padding: 0,
  },
  rateUnit: {
    fontSize: 15,
    color: Colors.textMuted,
    marginLeft: 4,
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
    fontWeight: "700" as const,
    color: Colors.text,
  },
});
