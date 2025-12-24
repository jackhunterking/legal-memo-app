/**
 * Contact Detail Screen
 * 
 * Displays contact information and all linked meetings.
 * Supports inline editing (iOS Contacts style) - tap Edit to enable editing mode.
 * Category selector uses bottom sheet modal (matching meeting type selector UI).
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Animated,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronLeft,
  Trash2,
  Phone,
  Mail,
  Building2,
  FileText,
  Calendar,
  Clock,
  Tag,
  ChevronRight,
  ChevronDown,
  X,
  Check,
} from "lucide-react-native";

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import * as Haptics from "expo-haptics";
import { useContactDetails, useContactMeetings, useContacts, useContactBillingSummary } from "@/contexts/ContactContext";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { formatContactName, getContactInitials, formatDuration, getStatusInfo, Meeting, ContactCategory, formatCurrency, formatBillableHours } from "@/types";
import { DollarSign as DollarSignIcon } from "lucide-react-native";

// Meeting Card for contact's meetings list
const MeetingCard = ({ 
  meeting, 
  onPress,
  currencySymbol = '$',
}: { 
  meeting: Meeting; 
  onPress: () => void;
  currencySymbol?: string;
}) => {
  const date = new Date(meeting.created_at);
  const statusInfo = getStatusInfo(meeting.status);

  return (
    <Pressable style={styles.meetingCard} onPress={onPress}>
      <View style={styles.meetingHeader}>
        <Text style={styles.meetingTitle} numberOfLines={1}>
          {meeting.title}
        </Text>
        <View style={styles.meetingHeaderBadges}>
          {meeting.is_billable && meeting.billable_amount && (
            <View style={styles.billableMeetingBadge}>
              <DollarSignIcon size={10} color={Colors.success} />
              <Text style={styles.billableMeetingText}>
                {formatCurrency(meeting.billable_amount, currencySymbol)}
              </Text>
            </View>
          )}
          {meeting.status !== 'ready' && (
            <View style={[styles.statusBadge, { backgroundColor: `${statusInfo.color}20` }]}>
              <Text style={[styles.statusText, { color: statusInfo.color }]}>
                {statusInfo.label}
              </Text>
            </View>
          )}
        </View>
      </View>
      
      <View style={styles.meetingMeta}>
        <View style={styles.metaItem}>
          <Calendar size={12} color={Colors.textMuted} />
          <Text style={styles.metaText}>
            {date.toLocaleDateString()}
          </Text>
        </View>
        {meeting.duration_seconds > 0 && (
          <View style={styles.metaItem}>
            <Clock size={12} color={Colors.textMuted} />
            <Text style={styles.metaText}>
              {formatDuration(meeting.duration_seconds)}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
};

/**
 * Category Selector Modal
 * Bottom sheet for selecting contact category (matches meeting type selector UI)
 */
const CategorySelectorModal = ({
  visible,
  onClose,
  categories,
  currentCategoryId,
  onSelect,
  onManageCategories,
}: {
  visible: boolean;
  onClose: () => void;
  categories: ContactCategory[];
  currentCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
  onManageCategories: () => void;
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={categorySelectorStyles.overlay}>
        <Pressable style={categorySelectorStyles.backdrop} onPress={onClose} />
        <View style={categorySelectorStyles.container}>
          {/* Fixed Header */}
          <View style={categorySelectorStyles.handle} />
          <View style={categorySelectorStyles.header}>
            <Text style={categorySelectorStyles.title}>Contact Category</Text>
            <Pressable onPress={onClose} style={categorySelectorStyles.closeButton}>
              <X size={24} color="#ffffff" />
            </Pressable>
          </View>

          {/* Scrollable Content */}
          <ScrollView 
            style={categorySelectorStyles.scrollContent} 
            contentContainerStyle={categorySelectorStyles.scrollContentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* No Category Option */}
            <Pressable
              style={[
                categorySelectorStyles.categoryOption,
                currentCategoryId === null && categorySelectorStyles.categoryOptionSelected,
              ]}
              onPress={() => onSelect(null)}
            >
              <View style={categorySelectorStyles.categoryLeft}>
                <View style={[categorySelectorStyles.categoryDot, { backgroundColor: Colors.textMuted }]} />
                <Text style={categorySelectorStyles.categoryName}>No Category</Text>
              </View>
              {currentCategoryId === null && (
                <Check size={20} color={Colors.accentLight} />
              )}
            </Pressable>

            {/* Category Options */}
            {categories.map((category) => (
              <Pressable
                key={category.id}
                style={[
                  categorySelectorStyles.categoryOption,
                  currentCategoryId === category.id && categorySelectorStyles.categoryOptionSelected,
                ]}
                onPress={() => onSelect(category.id)}
              >
                <View style={categorySelectorStyles.categoryLeft}>
                  <View style={[categorySelectorStyles.categoryDot, { backgroundColor: category.color }]} />
                  <Text style={categorySelectorStyles.categoryName}>{category.name}</Text>
                </View>
                {currentCategoryId === category.id && (
                  <Check size={20} color={Colors.accentLight} />
                )}
              </Pressable>
            ))}
          </ScrollView>

          {/* Fixed Footer Button */}
          <View style={categorySelectorStyles.footer}>
            <Pressable
              style={categorySelectorStyles.manageButton}
              onPress={onManageCategories}
            >
              <Text style={categorySelectorStyles.manageButtonText}>
                Manage Categories in Settings
              </Text>
              <ChevronRight size={18} color={Colors.accentLight} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function ContactDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: contact, isLoading, refetch } = useContactDetails(id || null);
  const { data: meetings, isLoading: isMeetingsLoading } = useContactMeetings(id || null);
  const { data: billingSummary, isLoading: isBillingSummaryLoading } = useContactBillingSummary(id || null);
  const { deleteContact, updateContact, isDeletingContact, isUpdatingContact, contactCategories } = useContacts();
  const { profile } = useAuth();

  // Currency symbol from user profile
  const currencySymbol = profile?.currency_symbol || '$';

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [showCategorySelector, setShowCategorySelector] = useState(false);
  
  // Collapsible state for Contact Details
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);
  const detailsRotation = useRef(new Animated.Value(1)).current;

  // Toggle collapsible with animation
  const toggleDetails = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.timing(detailsRotation, {
      toValue: isDetailsExpanded ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setIsDetailsExpanded(!isDetailsExpanded);
  };

  const detailsChevronRotation = detailsRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  // Local edit state for all fields
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);

  // Load contact data into edit state when entering edit mode
  const loadEditState = useCallback(() => {
    if (contact) {
      setEditFirstName(contact.first_name);
      setEditLastName(contact.last_name || "");
      setEditCompany(contact.company || "");
      setEditEmail(contact.email || "");
      setEditPhone(contact.phone || "");
      setEditNotes(contact.notes || "");
      setEditCategoryId(contact.category_id || null);
    }
  }, [contact]);

  // Handle entering edit mode
  const handleEdit = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    loadEditState();
    setIsEditing(true);
  };

  // Handle cancel editing
  const handleCancel = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsEditing(false);
  };

  // Handle save changes
  const handleDone = async () => {
    const trimmedFirstName = editFirstName.trim();
    
    if (!trimmedFirstName) {
      Alert.alert("Required Field", "First name is required.");
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      await updateContact({
        id: id!,
        updates: {
          first_name: trimmedFirstName,
          last_name: editLastName.trim() || null,
          company: editCompany.trim() || null,
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
          notes: editNotes.trim() || null,
          category_id: editCategoryId,
        },
      });

      await refetch();
      setIsEditing(false);
      
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.error("[ContactDetail] Update error:", err);
      Alert.alert("Error", "Could not save changes. Please try again.");
    }
  };

  // Handle contact deletion
  const handleDelete = async () => {
    if (!id) return;

    const performDelete = async () => {
      try {
        await deleteContact(id);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        router.replace("/(tabs)/contacts");
      } catch (err) {
        console.error("[ContactDetail] Delete error:", err);
        Alert.alert("Error", "Could not delete contact.");
      }
    };

    const meetingsCount = meetings?.length || 0;
    const warningMessage = meetingsCount > 0
      ? `This contact is linked to ${meetingsCount} meeting${meetingsCount > 1 ? 's' : ''}. Deleting will unlink them. This action cannot be undone.`
      : "This will permanently delete the contact. This action cannot be undone.";

    if (Platform.OS === "web") {
      if (confirm(warningMessage)) {
        performDelete();
      }
    } else {
      Alert.alert(
        "Delete Contact",
        warningMessage,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: performDelete },
        ]
      );
    }
  };

  // Handle category selection
  const handleSelectCategory = (categoryId: string | null) => {
    setEditCategoryId(categoryId);
    setShowCategorySelector(false);
  };

  // Navigate to settings to manage categories
  const handleManageCategories = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowCategorySelector(false);
    router.push("/(tabs)/settings");
  };

  // Handle phone call
  const handleCall = useCallback(() => {
    if (!contact?.phone) return;
    const phoneUrl = `tel:${contact.phone}`;
    Linking.canOpenURL(phoneUrl).then((supported) => {
      if (supported) {
        Linking.openURL(phoneUrl);
      } else {
        Alert.alert("Error", "Phone calls are not supported on this device.");
      }
    });
  }, [contact?.phone]);

  // Handle email
  const handleEmail = useCallback(() => {
    if (!contact?.email) return;
    const emailUrl = `mailto:${contact.email}`;
    Linking.canOpenURL(emailUrl).then((supported) => {
      if (supported) {
        Linking.openURL(emailUrl);
      } else {
        Alert.alert("Error", "Email is not supported on this device.");
      }
    });
  }, [contact?.email]);

  // Handle meeting press
  const handleMeetingPress = (meeting: Meeting) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(`/meeting/${meeting.id}`);
  };

  // Loading state
  if (isLoading || !contact) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accentLight} />
        </View>
      </SafeAreaView>
    );
  }

  // Get current category for display
  const displayCategory = isEditing 
    ? contactCategories.find(c => c.id === editCategoryId)
    : contact.category;

  const displayName = isEditing 
    ? [editFirstName.trim(), editLastName.trim()].filter(Boolean).join(" ") || "New Contact"
    : formatContactName(contact);

  const initials = isEditing
    ? (editFirstName.charAt(0) + (editLastName.charAt(0) || "")).toUpperCase() || "?"
    : getContactInitials(contact);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color={Colors.text} />
        </Pressable>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Contact
          </Text>
        </View>
        
        <View style={styles.headerActions}>
          {isEditing ? (
            <>
              <Pressable style={styles.headerTextButton} onPress={handleCancel}>
                <Text style={styles.headerTextButtonText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.headerTextButton, styles.headerDoneButton]} 
                onPress={handleDone}
                disabled={isUpdatingContact}
              >
                {isUpdatingContact ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <Text style={[styles.headerTextButtonText, styles.headerDoneButtonText]}>Done</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Pressable style={styles.headerTextButton} onPress={handleEdit}>
                <Text style={styles.headerTextButtonText}>Edit</Text>
              </Pressable>
              <Pressable 
                style={styles.headerActionButton} 
                onPress={handleDelete}
                disabled={isDeletingContact}
              >
                <Trash2 size={20} color={Colors.error} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Contact Hero - Compact */}
          <View style={styles.heroSection}>
            <View style={[styles.avatarLarge, { backgroundColor: displayCategory?.color || Colors.accentLight }]}>
              <Text style={styles.avatarLargeText}>{initials}</Text>
            </View>
            
            {isEditing ? (
              <View style={styles.nameEditContainer}>
                <View style={styles.nameInputGroup}>
                  <Text style={styles.nameInputLabel}>First Name *</Text>
                  <TextInput
                    style={styles.nameInput}
                    value={editFirstName}
                    onChangeText={setEditFirstName}
                    placeholder="First name"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.nameInputGroup}>
                  <Text style={styles.nameInputLabel}>Last Name</Text>
                  <TextInput
                    style={styles.nameInput}
                    value={editLastName}
                    onChangeText={setEditLastName}
                    placeholder="Last name"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            ) : (
              <Text style={styles.contactName}>{displayName}</Text>
            )}
          </View>

          {/* Contact Details Card - Collapsible */}
          <View style={styles.card}>
            <Pressable 
              style={styles.cardHeader} 
              onPress={!isEditing ? toggleDetails : undefined}
              disabled={isEditing}
            >
              <Text style={styles.cardTitle}>Contact Details</Text>
              {!isEditing && (
                <Animated.View style={{ transform: [{ rotate: detailsChevronRotation }] }}>
                  <ChevronDown size={20} color={Colors.textMuted} />
                </Animated.View>
              )}
            </Pressable>

            {/* Collapsible Content - Always show in edit mode */}
            {(isDetailsExpanded || isEditing) && (
              <>
                {/* Company */}
                <View style={styles.detailRow}>
                  <Building2 size={18} color={Colors.textMuted} />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Company</Text>
                    {isEditing ? (
                      <TextInput
                        style={styles.detailInput}
                        value={editCompany}
                        onChangeText={setEditCompany}
                        placeholder="Company or firm name"
                        placeholderTextColor={Colors.textMuted}
                        autoCapitalize="words"
                      />
                    ) : (
                      <Text style={styles.detailValue}>
                        {contact.company || <Text style={styles.notSetText}>Not set</Text>}
                      </Text>
                    )}
                  </View>
                </View>
                
                {/* Phone */}
                <Pressable 
                  style={styles.detailRow} 
                  onPress={!isEditing && contact.phone ? handleCall : undefined}
                  disabled={isEditing}
                >
                  <Phone size={18} color={Colors.textMuted} />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Phone</Text>
                    {isEditing ? (
                      <TextInput
                        style={styles.detailInput}
                        value={editPhone}
                        onChangeText={setEditPhone}
                        placeholder="Phone number"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="phone-pad"
                      />
                    ) : (
                      <Text style={[styles.detailValue, contact.phone && styles.detailLink]}>
                        {contact.phone || <Text style={styles.notSetText}>Not set</Text>}
                      </Text>
                    )}
                  </View>
                </Pressable>
                
                {/* Email */}
                <Pressable 
                  style={styles.detailRow} 
                  onPress={!isEditing && contact.email ? handleEmail : undefined}
                  disabled={isEditing}
                >
                  <Mail size={18} color={Colors.textMuted} />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Email</Text>
                    {isEditing ? (
                      <TextInput
                        style={styles.detailInput}
                        value={editEmail}
                        onChangeText={setEditEmail}
                        placeholder="email@example.com"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    ) : (
                      <Text style={[styles.detailValue, contact.email && styles.detailLink]}>
                        {contact.email || <Text style={styles.notSetText}>Not set</Text>}
                      </Text>
                    )}
                  </View>
                </Pressable>
                
                {/* Category */}
                <Pressable 
                  style={styles.detailRow}
                  onPress={isEditing ? () => setShowCategorySelector(true) : undefined}
                  disabled={!isEditing}
                >
                  <Tag size={18} color={Colors.textMuted} />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Category</Text>
                    <View style={styles.detailCategoryRow}>
                      {displayCategory ? (
                        <>
                          <View style={[styles.detailCategoryDot, { backgroundColor: displayCategory.color }]} />
                          <Text style={styles.detailValue}>{displayCategory.name}</Text>
                        </>
                      ) : (
                        <Text style={styles.notSetText}>Not set</Text>
                      )}
                      {isEditing && <ChevronRight size={16} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />}
                    </View>
                  </View>
                </Pressable>
                
                {/* Notes - Last row in combined card */}
                <View style={[styles.detailRow, styles.detailRowLast]}>
                  <FileText size={18} color={Colors.textMuted} />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Notes</Text>
                    {isEditing ? (
                      <TextInput
                        style={[styles.detailInput, styles.notesInputInline]}
                        value={editNotes}
                        onChangeText={setEditNotes}
                        placeholder="Add notes about this contact..."
                        placeholderTextColor={Colors.textMuted}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                      />
                    ) : (
                      <Text style={styles.detailValue}>
                        {contact.notes || <Text style={styles.notSetText}>No notes</Text>}
                      </Text>
                    )}
                  </View>
                </View>
              </>
            )}
          </View>

          {/* Billing Summary - Hide in edit mode, only show if there are billable meetings */}
          {!isEditing && billingSummary && billingSummary.billableMeetingsCount > 0 && (
            <View style={styles.billingSummaryCard}>
              <View style={styles.billingSummaryHeader}>
                <DollarSignIcon size={18} color={Colors.success} />
                <Text style={styles.billingSummaryTitle}>Billing Summary</Text>
              </View>
              
              {isBillingSummaryLoading ? (
                <ActivityIndicator size="small" color={Colors.accentLight} />
              ) : (
                <View style={styles.billingSummaryContent}>
                  <View style={styles.billingSummaryRow}>
                    <Text style={styles.billingSummaryLabel}>Total Hours</Text>
                    <Text style={styles.billingSummaryValue}>
                      {formatBillableHours(billingSummary.totalHours)}
                    </Text>
                  </View>
                  <View style={styles.billingSummaryRow}>
                    <Text style={styles.billingSummaryLabel}>Total Billed</Text>
                    <Text style={styles.billingSummaryAmountValue}>
                      {formatCurrency(billingSummary.totalAmount, currencySymbol)}
                    </Text>
                  </View>
                  <View style={[styles.billingSummaryRow, styles.billingSummaryRowLast]}>
                    <Text style={styles.billingSummaryLabel}>Billable Meetings</Text>
                    <Text style={styles.billingSummaryValue}>
                      {billingSummary.billableMeetingsCount}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Meetings Section - Hide in edit mode */}
          {!isEditing && (
            <View style={styles.meetingsSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Linked Meetings</Text>
                <Text style={styles.sectionCount}>
                  {meetings?.length || 0}
                </Text>
              </View>
              
              {isMeetingsLoading ? (
                <View style={styles.meetingsLoading}>
                  <ActivityIndicator size="small" color={Colors.accentLight} />
                </View>
              ) : meetings && meetings.length > 0 ? (
                meetings.map((meeting) => (
                  <MeetingCard 
                    key={meeting.id}
                    meeting={meeting} 
                    onPress={() => handleMeetingPress(meeting)}
                    currencySymbol={currencySymbol}
                  />
                ))
              ) : (
                <View style={styles.emptyMeetings}>
                  <Text style={styles.emptyMeetingsText}>
                    No meetings linked to this contact yet
                  </Text>
                  <Text style={styles.emptyMeetingsHint}>
                    Assign this contact when viewing a meeting
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category Selector Modal */}
      <CategorySelectorModal
        visible={showCategorySelector}
        onClose={() => setShowCategorySelector(false)}
        categories={contactCategories}
        currentCategoryId={editCategoryId}
        onSelect={handleSelectCategory}
        onManageCategories={handleManageCategories}
      />
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backButton: {
    padding: 4,
    marginRight: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerActionButton: {
    padding: 8,
  },
  headerTextButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerTextButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: Colors.accentLight,
  },
  headerDoneButton: {
    backgroundColor: Colors.accentLight,
    borderRadius: 8,
    minWidth: 60,
    alignItems: "center",
  },
  headerDoneButtonText: {
    color: Colors.text,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  heroSection: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarLargeText: {
    fontSize: 30,
    fontWeight: "700",
    color: Colors.text,
  },
  contactName: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
  },
  nameEditContainer: {
    width: "100%",
    gap: 10,
  },
  nameInputGroup: {
    gap: 4,
  },
  nameInputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nameInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 17,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlign: "center",
  },
  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 15,
    color: Colors.text,
  },
  detailInput: {
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notesInputInline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  detailLink: {
    color: Colors.accentLight,
  },
  notSetText: {
    color: Colors.textMuted,
    fontStyle: "italic",
  },
  detailCategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailCategoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  meetingsSection: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
  },
  sectionCount: {
    fontSize: 14,
    color: Colors.textMuted,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  meetingsLoading: {
    paddingVertical: 32,
    alignItems: "center",
  },
  meetingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  meetingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  meetingHeaderBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  meetingTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
    flex: 1,
  },
  billableMeetingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.success + "20",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  billableMeetingText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.success,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  meetingMeta: {
    flexDirection: "row",
    gap: 16,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  emptyMeetings: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyMeetingsText: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  emptyMeetingsHint: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  // Billing Summary styles
  billingSummaryCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.success + "30",
  },
  billingSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  billingSummaryTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
  },
  billingSummaryContent: {
    gap: 0,
  },
  billingSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  billingSummaryRowLast: {
    borderBottomWidth: 0,
  },
  billingSummaryLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  billingSummaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
  },
  billingSummaryAmountValue: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.success,
  },
});

// Category Selector Modal Styles (matches TypeSelectorModal from meeting detail)
const categorySelectorStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  container: {
    backgroundColor: '#1a1f2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "60%",
    paddingBottom: Platform.OS === "ios" ? 20 : 0,
    flexDirection: 'column',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#4b5563',
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: '#ffffff',
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContentContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  categoryOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#252b3d',
    borderRadius: 12,
    marginBottom: 10,
  },
  categoryOptionSelected: {
    borderWidth: 2,
    borderColor: Colors.accentLight,
  },
  categoryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  categoryDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  categoryName: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: "500",
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#374151',
    backgroundColor: '#1a1f2e',
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 6,
  },
  manageButtonText: {
    fontSize: 14,
    color: Colors.accentLight,
    fontWeight: "500",
  },
});
