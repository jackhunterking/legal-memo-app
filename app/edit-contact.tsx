/**
 * Edit Contact Screen
 * 
 * Create or edit a contact with form fields for:
 * - First Name (required)
 * - Last Name
 * - Company/Firm
 * - Email
 * - Phone
 * - Notes
 * - Category
 * 
 * When coming from a meeting detail screen with meetingId param,
 * the new contact will be automatically assigned to that meeting.
 */

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
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { X, ChevronDown, Check } from "lucide-react-native";
import { lightImpact, mediumImpact, successNotification } from "@/lib/haptics";
import { useContactDetails, useContacts } from "@/contexts/ContactContext";
import { useMeetings } from "@/contexts/MeetingContext";
import Colors from "@/constants/colors";
import type { ContactCategory } from "@/types";

export default function EditContactScreen() {
  const router = useRouter();
  // id = contact id for editing, meetingId = meeting to auto-assign new contact to
  const { id, meetingId } = useLocalSearchParams<{ id?: string; meetingId?: string }>();
  const isEditing = !!id;
  
  const { data: existingContact, isLoading: isLoadingContact } = useContactDetails(id || null);
  const { 
    contactCategories,
    createContact, 
    updateContact, 
    isCreatingContact, 
    isUpdatingContact,
    isContactCategoriesLoading,
    refetchContacts,
  } = useContacts();
  const { updateMeeting } = useMeetings();

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [showCategorySelector, setShowCategorySelector] = useState(false);

  // Load existing contact data when editing
  useEffect(() => {
    if (existingContact) {
      setFirstName(existingContact.first_name);
      setLastName(existingContact.last_name || "");
      setCompany(existingContact.company || "");
      setEmail(existingContact.email || "");
      setPhone(existingContact.phone || "");
      setNotes(existingContact.notes || "");
      setSelectedCategoryId(existingContact.category_id || null);
    }
  }, [existingContact]);

  const selectedCategory = selectedCategoryId 
    ? contactCategories.find(c => c.id === selectedCategoryId) 
    : null;

  const isSaving = isCreatingContact || isUpdatingContact;

  const handleSave = async () => {
    // Validate required fields
    const trimmedFirstName = firstName.trim();
    if (!trimmedFirstName) {
      Alert.alert("Required Field", "Please enter a first name.");
      return;
    }

    mediumImpact();

    try {
      const contactData = {
        first_name: trimmedFirstName,
        last_name: lastName.trim() || null,
        company: company.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
        category_id: selectedCategoryId,
      };

      if (isEditing && id) {
        await updateContact({ id, updates: contactData });
      } else {
        // Create the new contact
        const newContact = await createContact(contactData);
        
        // If we came from a meeting detail screen, auto-assign this contact to that meeting
        if (meetingId && newContact?.id) {
          console.log("[EditContact] Auto-assigning contact to meeting:", meetingId);
          try {
            await updateMeeting({
              meetingId,
              updates: { contact_id: newContact.id },
            });
          } catch (assignErr) {
            console.error("[EditContact] Error assigning contact to meeting:", assignErr);
            // Don't fail the whole operation, contact was created successfully
          }
        }
      }

      // Ensure the contacts list is refreshed
      await refetchContacts();

      successNotification();
      router.back();
    } catch (err) {
      console.error("[EditContact] Error saving contact:", err);
      Alert.alert("Error", "Could not save contact. Please try again.");
    }
  };

  const handleCancel = () => {
    if (Platform.OS !== "web") {
      lightImpact();
    }
    router.back();
  };

  const handleSelectCategory = (category: ContactCategory | null) => {
    if (Platform.OS !== "web") {
      lightImpact();
    }
    setSelectedCategoryId(category?.id || null);
    setShowCategorySelector(false);
  };

  // Loading state for editing
  if (isEditing && isLoadingContact) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accentLight} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.cancelButton} onPress={handleCancel}>
            <X size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {isEditing ? "Edit Contact" : "New Contact"}
          </Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Name Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Name</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>First Name *</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Enter first name"
                placeholderTextColor={Colors.textMuted}
                autoFocus={!isEditing}
                autoCapitalize="words"
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Enter last name"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Company Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Company / Firm</Text>
            <TextInput
              style={styles.input}
              value={company}
              onChangeText={setCompany}
              placeholder="Enter company or firm name"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="words"
            />
          </View>

          {/* Contact Info Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact Information</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter phone number"
                placeholderTextColor={Colors.textMuted}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Category Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category</Text>
            <Pressable
              style={styles.categorySelector}
              onPress={() => setShowCategorySelector(!showCategorySelector)}
            >
              {selectedCategory ? (
                <View style={styles.selectedCategory}>
                  <View style={[styles.categoryDot, { backgroundColor: selectedCategory.color }]} />
                  <Text style={styles.selectedCategoryText}>{selectedCategory.name}</Text>
                </View>
              ) : (
                <Text style={styles.categoryPlaceholder}>Select a category (optional)</Text>
              )}
              <ChevronDown 
                size={20} 
                color={Colors.textMuted}
                style={showCategorySelector ? { transform: [{ rotate: '180deg' }] } : undefined}
              />
            </Pressable>

            {/* Category Options Dropdown */}
            {showCategorySelector && (
              <View style={styles.categoryDropdown}>
                {/* No Category Option */}
                <Pressable
                  style={[
                    styles.categoryOption,
                    selectedCategoryId === null && styles.categoryOptionSelected,
                  ]}
                  onPress={() => handleSelectCategory(null)}
                >
                  <View style={styles.categoryOptionLeft}>
                    <View style={[styles.categoryOptionDot, { backgroundColor: Colors.textMuted }]} />
                    <Text style={styles.categoryOptionText}>No Category</Text>
                  </View>
                  {selectedCategoryId === null && (
                    <Check size={18} color={Colors.accentLight} />
                  )}
                </Pressable>

                {/* Category Options */}
                {isContactCategoriesLoading ? (
                  <View style={styles.categoryLoading}>
                    <ActivityIndicator size="small" color={Colors.accentLight} />
                  </View>
                ) : (
                  contactCategories.map((category) => (
                    <Pressable
                      key={category.id}
                      style={[
                        styles.categoryOption,
                        selectedCategoryId === category.id && styles.categoryOptionSelected,
                      ]}
                      onPress={() => handleSelectCategory(category)}
                    >
                      <View style={styles.categoryOptionLeft}>
                        <View style={[styles.categoryOptionDot, { backgroundColor: category.color }]} />
                        <Text style={styles.categoryOptionText}>{category.name}</Text>
                      </View>
                      {selectedCategoryId === category.id && (
                        <Check size={18} color={Colors.accentLight} />
                      )}
                    </Pressable>
                  ))
                )}
              </View>
            )}
          </View>

          {/* Notes Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add any notes about this contact..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>

        {/* Footer with Save Button */}
        <View style={styles.footer}>
          <Pressable
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <Text style={styles.saveButtonText}>
                {isEditing ? "Save Changes" : "Create Contact"}
              </Text>
            )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.textSecondary,
    marginBottom: 8,
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
  notesInput: {
    minHeight: 100,
    paddingTop: 14,
  },
  categorySelector: {
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
  selectedCategory: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  selectedCategoryText: {
    fontSize: 16,
    color: Colors.text,
  },
  categoryPlaceholder: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  categoryDropdown: {
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  categoryOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  categoryOptionSelected: {
    backgroundColor: Colors.accentLight + "15",
  },
  categoryOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  categoryOptionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  categoryOptionText: {
    fontSize: 16,
    color: Colors.text,
  },
  categoryLoading: {
    paddingVertical: 20,
    alignItems: "center",
  },
  footer: {
    paddingHorizontal: 20,
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

