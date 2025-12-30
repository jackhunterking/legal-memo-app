import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  Platform,
  ScrollView,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogOut, Trash2, ChevronRight, Info, MessageCircleHeart, Send, Fingerprint, Tag, Plus, Pencil, X, Check, Users, DollarSign, CreditCard, Zap, Clock, AlertTriangle, ExternalLink, Crown } from "lucide-react-native";
import * as Linking from "expo-linking";
import { lightImpact, mediumImpact, successNotification } from "@/lib/haptics";
import { useAuth } from "@/contexts/AuthContext";
import { useMeetings } from "@/contexts/MeetingContext";
import { useContacts } from "@/contexts/ContactContext";
import { useUsage } from "@/contexts/UsageContext";
import Colors from "@/constants/colors";
import { isBiometricSupported, getBiometricType, isBiometricEnabled, setBiometricEnabled } from "@/lib/biometrics";
import { DEFAULT_TYPE_COLORS, MeetingType, ContactCategory, DEFAULT_CONTACT_CATEGORY_COLORS, CURRENCY_SYMBOLS } from "@/types";
import DraggableBottomSheet from "@/components/DraggableBottomSheet";
import { supabase } from "@/lib/supabase";

// Meeting Type Editor Modal Component
const MeetingTypeModal = ({
  visible,
  onClose,
  type,
  existingTypes,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  visible: boolean;
  onClose: () => void;
  type: MeetingType | null;
  existingTypes: MeetingType[];
  onSave: (name: string, color: string) => Promise<void>;
  onDelete?: (type: MeetingType) => void;
  isSaving: boolean;
  isDeleting?: boolean;
}) => {
  const [name, setName] = useState(type?.name || "");
  const [selectedColor, setSelectedColor] = useState(type?.color || DEFAULT_TYPE_COLORS[0]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setName(type?.name || "");
      setSelectedColor(type?.color || DEFAULT_TYPE_COLORS[0]);
    }
  }, [visible, type]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    
    if (!trimmedName) {
      Alert.alert("Error", "Please enter a name for the meeting type.");
      return;
    }
    
    // Check for duplicate names (case-insensitive)
    // When editing, exclude the current type from the check
    const isDuplicate = existingTypes.some(
      (existingType) =>
        existingType.name.toLowerCase() === trimmedName.toLowerCase() &&
        existingType.id !== type?.id
    );
    
    if (isDuplicate) {
      Alert.alert(
        "Duplicate Name",
        `A meeting type named "${trimmedName}" already exists. Please choose a different name.`
      );
      return;
    }
    
    Keyboard.dismiss();
    await onSave(trimmedName, selectedColor);
  };

  const handleDelete = () => {
    if (!type || !onDelete) return;
    
    if (type.is_default) {
      Alert.alert("Cannot Delete", "Default meeting types cannot be deleted, but you can rename them.");
      return;
    }

    if (Platform.OS === "web") {
      if (confirm(`Are you sure you want to delete "${type.name}"? Any meetings with this type will be updated.`)) {
        onDelete(type);
      }
    } else {
      Alert.alert(
        "Delete Type",
        `Are you sure you want to delete "${type.name}"? Any meetings with this type will be updated.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => onDelete(type) },
        ]
      );
    }
  };

  const handleDismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return (
    <DraggableBottomSheet
      visible={visible}
      onClose={onClose}
      title={type ? "Edit Type" : "New Meeting Type"}
      height={70}
    >
      <Text style={modalStyles.label}>Name</Text>
      <TextInput
        ref={inputRef}
        style={modalStyles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g., Client Call"
        placeholderTextColor={Colors.textMuted}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleDismissKeyboard}
        blurOnSubmit={true}
      />

      <Text style={modalStyles.label}>Color</Text>
      <View style={modalStyles.colorGrid}>
        {DEFAULT_TYPE_COLORS.map((color) => (
          <Pressable
            key={color}
            style={[
              modalStyles.colorOption,
              { backgroundColor: color },
              selectedColor === color && modalStyles.colorOptionSelected,
            ]}
            onPress={() => {
              setSelectedColor(color);
              Keyboard.dismiss();
            }}
          >
            {selectedColor === color && <Check size={16} color="#fff" />}
          </Pressable>
        ))}
      </View>

      <View style={modalStyles.preview}>
        <Text style={modalStyles.previewLabel}>Preview:</Text>
        <View style={[modalStyles.previewBadge, { backgroundColor: selectedColor + "20" }]}>
          <View style={[modalStyles.previewDot, { backgroundColor: selectedColor }]} />
          <Text style={[modalStyles.previewText, { color: selectedColor }]}>
            {name || "Meeting Type"}
          </Text>
        </View>
      </View>

      <View style={modalStyles.footer}>
        {type && !type.is_default && onDelete && (
          <Pressable
            style={[modalStyles.deleteButton, isDeleting && modalStyles.deleteButtonDisabled]}
            onPress={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <>
                <Trash2 size={16} color={Colors.error} />
                <Text style={modalStyles.deleteButtonText}>Delete</Text>
              </>
            )}
          </Pressable>
        )}
        <View style={modalStyles.actionButtons}>
          <Pressable style={modalStyles.cancelButton} onPress={onClose}>
            <Text style={modalStyles.cancelButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[modalStyles.saveButton, isSaving && modalStyles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <Text style={modalStyles.saveButtonText}>Save</Text>
            )}
          </Pressable>
        </View>
      </View>
    </DraggableBottomSheet>
  );
};

// Contact Category Editor Modal Component
const ContactCategoryModal = ({
  visible,
  onClose,
  category,
  existingCategories,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  visible: boolean;
  onClose: () => void;
  category: ContactCategory | null;
  existingCategories: ContactCategory[];
  onSave: (name: string, color: string) => Promise<void>;
  onDelete?: (category: ContactCategory) => void;
  isSaving: boolean;
  isDeleting?: boolean;
}) => {
  const [name, setName] = useState(category?.name || "");
  const [selectedColor, setSelectedColor] = useState(category?.color || DEFAULT_CONTACT_CATEGORY_COLORS[0]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setName(category?.name || "");
      setSelectedColor(category?.color || DEFAULT_CONTACT_CATEGORY_COLORS[0]);
    }
  }, [visible, category]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    
    if (!trimmedName) {
      Alert.alert("Error", "Please enter a name for the contact category.");
      return;
    }
    
    // Check for duplicate names (case-insensitive)
    const isDuplicate = existingCategories.some(
      (existingCat) =>
        existingCat.name.toLowerCase() === trimmedName.toLowerCase() &&
        existingCat.id !== category?.id
    );
    
    if (isDuplicate) {
      Alert.alert(
        "Duplicate Name",
        `A contact category named "${trimmedName}" already exists. Please choose a different name.`
      );
      return;
    }
    
    Keyboard.dismiss();
    await onSave(trimmedName, selectedColor);
  };

  const handleDelete = () => {
    if (!category || !onDelete) return;
    
    if (category.is_default) {
      Alert.alert("Cannot Delete", "Default contact categories cannot be deleted, but you can rename them.");
      return;
    }

    if (Platform.OS === "web") {
      if (confirm(`Are you sure you want to delete "${category.name}"? Any contacts with this category will be updated.`)) {
        onDelete(category);
      }
    } else {
      Alert.alert(
        "Delete Category",
        `Are you sure you want to delete "${category.name}"? Any contacts with this category will be updated.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => onDelete(category) },
        ]
      );
    }
  };

  const handleDismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return (
    <DraggableBottomSheet
      visible={visible}
      onClose={onClose}
      title={category ? "Edit Category" : "New Contact Category"}
      height={70}
    >
      <Text style={modalStyles.label}>Name</Text>
      <TextInput
        ref={inputRef}
        style={modalStyles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g., Client"
        placeholderTextColor={Colors.textMuted}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleDismissKeyboard}
        blurOnSubmit={true}
      />

      <Text style={modalStyles.label}>Color</Text>
      <View style={modalStyles.colorGrid}>
        {DEFAULT_CONTACT_CATEGORY_COLORS.map((color) => (
          <Pressable
            key={color}
            style={[
              modalStyles.colorOption,
              { backgroundColor: color },
              selectedColor === color && modalStyles.colorOptionSelected,
            ]}
            onPress={() => {
              setSelectedColor(color);
              Keyboard.dismiss();
            }}
          >
            {selectedColor === color && <Check size={16} color="#fff" />}
          </Pressable>
        ))}
      </View>

      <View style={modalStyles.preview}>
        <Text style={modalStyles.previewLabel}>Preview:</Text>
        <View style={[modalStyles.previewBadge, { backgroundColor: selectedColor + "20" }]}>
          <View style={[modalStyles.previewDot, { backgroundColor: selectedColor }]} />
          <Text style={[modalStyles.previewText, { color: selectedColor }]}>
            {name || "Category Name"}
          </Text>
        </View>
      </View>

      <View style={modalStyles.footer}>
        {category && !category.is_default && onDelete && (
          <Pressable
            style={[modalStyles.deleteButton, isDeleting && modalStyles.deleteButtonDisabled]}
            onPress={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <>
                <Trash2 size={16} color={Colors.error} />
                <Text style={modalStyles.deleteButtonText}>Delete</Text>
              </>
            )}
          </Pressable>
        )}
        <View style={modalStyles.actionButtons}>
          <Pressable style={modalStyles.cancelButton} onPress={onClose}>
            <Text style={modalStyles.cancelButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[modalStyles.saveButton, isSaving && modalStyles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <Text style={modalStyles.saveButtonText}>Save</Text>
            )}
          </Pressable>
        </View>
      </View>
    </DraggableBottomSheet>
  );
};

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut, isSigningOut, profile, updateProfile } = useAuth();
  const {
    meetingTypes,
    isMeetingTypesLoading,
    createMeetingType,
    updateMeetingType,
    deleteMeetingType,
    refetchMeetingTypes,
    isCreatingType,
    isUpdatingType,
    isDeletingType,
  } = useMeetings();

  const {
    contactCategories,
    isContactCategoriesLoading,
    createContactCategory,
    updateContactCategory,
    deleteContactCategory,
    refetchContactCategories,
    isCreatingCategory,
    isUpdatingCategory,
    isDeletingCategory,
  } = useContacts();

  const {
    usageState,
    subscription,
    hasActiveSubscription,
    hasActiveTrial,
    isTrialExpired,
    trialDaysRemaining,
    isLoading: isUsageLoading,
    // Cancellation status
    isCanceling,
    canceledButStillActive,
    accessEndsAt,
    daysUntilAccessEnds,
  } = useUsage();

  const [featureRequest, setFeatureRequest] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);

  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricType, setBiometricType] = useState<string | null>(null);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);

  // Meeting type modal state
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<MeetingType | null>(null);

  // Contact category modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ContactCategory | null>(null);

  // Billing settings state
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [hourlyRateInput, setHourlyRateInput] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('$');
  const [isSavingBilling, setIsSavingBilling] = useState(false);

  // Subscription management state
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);

  // Initialize billing values from profile
  useEffect(() => {
    if (profile) {
      setHourlyRateInput(profile.hourly_rate?.toString() || '');
      setSelectedCurrency(profile.currency_symbol || '$');
    }
  }, [profile]);

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

  const handleAddType = () => {
    if (Platform.OS !== "web") {
      lightImpact();
    }
    setEditingType(null);
    setShowTypeModal(true);
  };

  const handleEditType = (type: MeetingType) => {
    if (Platform.OS !== "web") {
      lightImpact();
    }
    setEditingType(type);
    setShowTypeModal(true);
  };

  const handleDeleteType = async (type: MeetingType) => {
    if (type.is_default) {
      Alert.alert("Cannot Delete", "Default meeting types cannot be deleted, but you can rename them.");
      return;
    }

    try {
      await deleteMeetingType(type.id);
      // Explicitly refetch to ensure the list updates
      await refetchMeetingTypes();
      // Close the modal
      setShowTypeModal(false);
      setEditingType(null);
      successNotification();
    } catch (err) {
      console.error("[Settings] Delete type error:", err);
      Alert.alert("Error", "Could not delete meeting type.");
    }
  };

  const handleSaveType = async (name: string, color: string) => {
    try {
      if (editingType) {
        await updateMeetingType({ id: editingType.id, updates: { name, color } });
      } else {
        await createMeetingType({ name, color });
      }
      // Explicitly refetch to ensure the list updates
      await refetchMeetingTypes();
      setShowTypeModal(false);
      setEditingType(null);
      successNotification();
    } catch (err) {
      console.error("[Settings] Save type error:", err);
      Alert.alert("Error", "Could not save meeting type.");
    }
  };

  // Contact Category handlers
  const handleAddCategory = () => {
    if (Platform.OS !== "web") {
      lightImpact();
    }
    setEditingCategory(null);
    setShowCategoryModal(true);
  };

  const handleEditCategory = (category: ContactCategory) => {
    if (Platform.OS !== "web") {
      lightImpact();
    }
    setEditingCategory(category);
    setShowCategoryModal(true);
  };

  const handleDeleteCategory = async (category: ContactCategory) => {
    if (category.is_default) {
      Alert.alert("Cannot Delete", "Default contact categories cannot be deleted, but you can rename them.");
      return;
    }

    try {
      await deleteContactCategory(category.id);
      await refetchContactCategories();
      // Close the modal
      setShowCategoryModal(false);
      setEditingCategory(null);
      successNotification();
    } catch (err) {
      console.error("[Settings] Delete category error:", err);
      Alert.alert("Error", "Could not delete contact category.");
    }
  };

  const handleSaveCategory = async (name: string, color: string) => {
    try {
      if (editingCategory) {
        await updateContactCategory({ id: editingCategory.id, updates: { name, color } });
      } else {
        await createContactCategory({ name, color });
      }
      await refetchContactCategories();
      setShowCategoryModal(false);
      setEditingCategory(null);
      successNotification();
    } catch (err) {
      console.error("[Settings] Save category error:", err);
      Alert.alert("Error", "Could not save contact category.");
    }
  };

  // Billing handlers
  const handleOpenBilling = () => {
    if (Platform.OS !== "web") {
      lightImpact();
    }
    setHourlyRateInput(profile?.hourly_rate?.toString() || '');
    setSelectedCurrency(profile?.currency_symbol || '$');
    setShowBillingModal(true);
  };

  const handleSaveBilling = async () => {
    setIsSavingBilling(true);
    try {
      const hourlyRate = hourlyRateInput ? parseFloat(hourlyRateInput) : null;
      
      // Validate hourly rate
      if (hourlyRateInput && (isNaN(hourlyRate!) || hourlyRate! < 0)) {
        Alert.alert("Invalid Rate", "Please enter a valid hourly rate.");
        setIsSavingBilling(false);
        return;
      }

      await updateProfile({
        hourly_rate: hourlyRate,
        currency_symbol: selectedCurrency,
      });

      setShowBillingModal(false);
      successNotification();
    } catch (err) {
      console.error("[Settings] Save billing error:", err);
      Alert.alert("Error", "Could not save billing settings.");
    } finally {
      setIsSavingBilling(false);
    }
  };

  const handleToggleBiometric = async () => {
    if (Platform.OS !== "web") {
      lightImpact();
    }

    try {
      const newValue = !biometricEnabled;
      await setBiometricEnabled(newValue);
      setBiometricEnabledState(newValue);
      
      if (!newValue) {
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

  // Supabase URL for Edge Functions
  const SUPABASE_URL = "https://jaepslscnnjtowwkiudu.supabase.co";

  /**
   * Open Polar customer portal for subscription management
   * Per Polar docs: Make authenticated fetch request, then open returned URL
   * @see https://polar.sh/docs/integrate/sdk/adapters/supabase
   */
  const handleManageSubscription = async () => {
    if (Platform.OS !== "web") {
      lightImpact();
    }

    setIsManagingSubscription(true);

    try {
      console.log('[Settings] Opening customer portal...');
      
      // Get the current session for the JWT
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (!currentSession?.access_token) {
        throw new Error('Not authenticated. Please sign in again.');
      }
      
      console.log('[Settings] Making authenticated request to portal endpoint...');
      
      // Make authenticated request to the edge function
      // The SDK will verify the JWT, look up the customer ID, and redirect
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/polar-customer-portal`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`,
          },
          redirect: 'follow',
        }
      );
      
      console.log('[Settings] Portal response status:', response.status);
      console.log('[Settings] Portal response URL:', response.url);
      
      // The SDK redirects to Polar's customer portal
      // Check if we got redirected to a Polar URL
      if (response.url && response.url.includes('polar.sh')) {
        console.log('[Settings] Opening Polar portal URL:', response.url);
        await Linking.openURL(response.url);
        return;
      }
      
      // If not redirected, check for error response
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Settings] Portal error:', errorText);
        throw new Error(errorText || 'Failed to open subscription portal');
      }
      
      // Fallback: try to get URL from response body
      const responseText = await response.text();
      console.log('[Settings] Portal response body:', responseText.substring(0, 200));
      
      Alert.alert(
        "Manage Subscription",
        "Unable to open subscription management. Please try again later.",
        [{ text: "OK", style: "default" }]
      );
    } catch (error) {
      console.error('[Settings] Error opening portal:', error);
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Unable to open subscription management. Please try again.",
        [{ text: "OK", style: "default" }]
      );
    } finally {
      setIsManagingSubscription(false);
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

    mediumImpact();

    setIsSubmitting(true);

    // Simulate sending (in production, this would send to your backend)
    setTimeout(() => {
      console.log("[Settings] Feature request submitted:", featureRequest);
      setIsSubmitting(false);
      setFeatureRequest("");
      setShowThankYou(true);

      setTimeout(() => setShowThankYou(false), 4000);

      successNotification();
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
        
        <Text style={styles.sectionTitle}>Billing</Text>
        <View style={styles.section}>
          <Pressable
            style={[styles.settingRow, styles.pressableRow]}
            onPress={handleOpenBilling}
          >
            <View style={styles.settingLeft}>
              <DollarSign size={20} color={Colors.success} />
              <View style={styles.billingInfo}>
                <Text style={styles.settingLabel}>Default Hourly Rate</Text>
                {profile?.hourly_rate ? (
                  <Text style={styles.billingValue}>
                    {profile.currency_symbol || '$'}{profile.hourly_rate.toFixed(2)}/hr
                  </Text>
                ) : (
                  <Text style={styles.billingHint}>Not set</Text>
                )}
              </View>
            </View>
            <ChevronRight size={20} color={Colors.textMuted} />
          </Pressable>
        </View>

        {biometricSupported && (
          <>
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.section}>
              <Pressable
                style={[styles.settingRow, styles.pressableRow]}
                onPress={handleToggleBiometric}
              >
              <View style={styles.settingLeft}>
                <Fingerprint size={20} color={Colors.accentLight} />
                <View>
                  <Text style={styles.settingLabel}>{biometricType || "Biometric"} Login</Text>
                  <Text style={styles.settingHint}>Quick and secure sign in</Text>
                </View>
              </View>
                <View style={[styles.toggleIndicator, biometricEnabled && styles.toggleIndicatorActive]}>
                  <Text style={[styles.toggleText, biometricEnabled && styles.toggleTextActive]}>
                    {biometricEnabled ? 'On' : 'Off'}
                  </Text>
                </View>
              </Pressable>
            </View>
          </>
          )}

        <Text style={styles.sectionTitle}>Meeting Types</Text>
        <View style={styles.section}>
          {isMeetingTypesLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.accentLight} />
            </View>
          ) : (
            <>
              {meetingTypes.map((type, index) => (
                <View
                  key={type.id}
                  style={[
                    styles.typeRow,
                    index === meetingTypes.length - 1 && styles.typeRowLast,
                  ]}
                >
                  <View style={styles.typeLeft}>
                    <View style={[styles.typeDot, { backgroundColor: type.color }]} />
                    <Text style={styles.typeName}>{type.name}</Text>
                  </View>
                  <Pressable
                    style={styles.typeActionButton}
                    onPress={() => handleEditType(type)}
                  >
                    <Pencil size={16} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.addTypeRow} onPress={handleAddType}>
                <Plus size={18} color={Colors.accentLight} />
                <Text style={styles.addTypeText}>Add New Type</Text>
              </Pressable>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Contact Categories</Text>
        <View style={styles.section}>
          {isContactCategoriesLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.accentLight} />
            </View>
          ) : (
            <>
              {contactCategories.map((category, index) => (
                <View
                  key={category.id}
                  style={[
                    styles.typeRow,
                    index === contactCategories.length - 1 && styles.typeRowLast,
                  ]}
                >
                  <View style={styles.typeLeft}>
                    <View style={[styles.typeDot, { backgroundColor: category.color }]} />
                    <Text style={styles.typeName}>{category.name}</Text>
                  </View>
                  <Pressable
                    style={styles.typeActionButton}
                    onPress={() => handleEditCategory(category)}
                  >
                    <Pencil size={16} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.addTypeRow} onPress={handleAddCategory}>
                <Plus size={18} color={Colors.accentLight} />
                <Text style={styles.addTypeText}>Add New Category</Text>
              </Pressable>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Subscription & Usage</Text>
        <View style={styles.section}>
          {/* Subscription Status Row - Different UI based on status */}
          {hasActiveSubscription ? (
            // Active subscriber view (including canceled-but-active)
            canceledButStillActive ? (
              // Canceling state - show warning
              <Pressable
                style={[styles.settingRow, styles.pressableRow]}
                onPress={() => router.push("/subscription")}
              >
                <View style={styles.settingLeft}>
                  <View style={styles.cancelingBadgeContainer}>
                    <AlertTriangle size={16} color="#F59E0B" />
                  </View>
                  <View style={styles.billingInfo}>
                    <View style={styles.subscriptionTitleRow}>
                      <Text style={styles.settingLabel}>Subscription Canceling</Text>
                      <View style={styles.cancelingBadge}>
                        <Text style={styles.cancelingBadgeText}>ENDING</Text>
                      </View>
                    </View>
                    <Text style={[styles.billingHint, { color: "#F59E0B" }]}>
                      {daysUntilAccessEnds <= 1 
                        ? daysUntilAccessEnds === 0 
                          ? "Ends today"
                          : "Ends tomorrow"
                        : `${daysUntilAccessEnds} days remaining`
                      }
                    </Text>
                  </View>
                </View>
                <ChevronRight size={20} color={Colors.textMuted} />
              </Pressable>
            ) : (
              // Active subscriber view - show PRO badge and status
              <View style={styles.settingRow}>
                <View style={styles.settingLeft}>
                  <View style={styles.proBadgeContainer}>
                    <Crown size={16} color="#FFD700" />
                  </View>
                  <View style={styles.billingInfo}>
                    <View style={styles.subscriptionTitleRow}>
                      <Text style={styles.settingLabel}>Pro Subscription</Text>
                      <View style={styles.proBadge}>
                        <Text style={styles.proBadgeText}>PRO</Text>
                      </View>
                    </View>
                    <Text style={[styles.billingHint, { color: Colors.success }]}>
                      Unlimited Access Active
                    </Text>
                  </View>
                </View>
              </View>
            )
          ) : (
            // Non-subscriber view - show trial status or subscribe prompt
            <Pressable
              style={[styles.settingRow, styles.pressableRow]}
              onPress={() => router.push("/subscription")}
            >
              <View style={styles.settingLeft}>
                {isTrialExpired ? (
                  <AlertTriangle size={20} color={Colors.error} />
                ) : hasActiveTrial ? (
                  <Clock size={20} color={trialDaysRemaining <= 2 ? Colors.warning : Colors.accent} />
                ) : (
                  <CreditCard size={20} color={Colors.textMuted} />
                )}
                <View style={styles.billingInfo}>
                  <Text style={styles.settingLabel}>
                    {isTrialExpired 
                      ? "Trial Expired" 
                      : hasActiveTrial 
                        ? "Free Trial" 
                        : "No Subscription"}
                  </Text>
                  <Text style={[
                    styles.billingHint,
                    hasActiveTrial && !isTrialExpired && { color: trialDaysRemaining <= 2 ? Colors.warning : Colors.accent },
                    isTrialExpired && { color: Colors.error },
                  ]}>
                    {isTrialExpired 
                      ? 'Subscribe to continue'
                      : trialDaysRemaining === 0
                        ? 'Trial ends today!'
                        : trialDaysRemaining === 1
                          ? 'Trial ends tomorrow!'
                          : `${trialDaysRemaining} days left in trial`}
                  </Text>
                </View>
              </View>
              <ChevronRight size={20} color={Colors.textMuted} />
            </Pressable>
          )}

          {/* Manage Subscription Button - For active subscribers */}
          {hasActiveSubscription && (
            <Pressable
              style={[styles.settingRow, styles.pressableRow, styles.manageSubRow]}
              onPress={handleManageSubscription}
              disabled={isManagingSubscription}
            >
              <View style={styles.settingLeft}>
                <CreditCard size={20} color={canceledButStillActive ? "#F59E0B" : Colors.accent} />
                <View style={styles.billingInfo}>
                  <Text style={styles.settingLabel}>
                    {canceledButStillActive ? "Undo Cancellation" : "Manage Subscription"}
                  </Text>
                  <Text style={styles.billingHint}>
                    {canceledButStillActive 
                      ? `Access ends ${accessEndsAt?.toLocaleDateString() || 'soon'}`
                      : subscription?.current_period_end 
                        ? `Renews ${new Date(subscription.current_period_end).toLocaleDateString()}`
                        : 'Billing, cancel, update payment'
                    }
                  </Text>
                </View>
              </View>
              {isManagingSubscription ? (
                <ActivityIndicator size="small" color={canceledButStillActive ? "#F59E0B" : Colors.accent} />
              ) : (
                <ExternalLink size={20} color={Colors.textMuted} />
              )}
            </Pressable>
          )}
          
          {/* Usage Stats Mini Display */}
          {!isUsageLoading && (
            <View style={styles.usageStatsRow}>
              <View style={styles.usageStat}>
                <Text style={styles.usageStatValue}>{usageState.lifetimeMinutesUsed}</Text>
                <Text style={styles.usageStatLabel}>Total Min</Text>
              </View>
              {hasActiveSubscription && !canceledButStillActive && (
                <>
                  <View style={styles.usageStatDivider} />
                  <View style={styles.usageStat}>
                    <Text style={[styles.usageStatValue, { color: Colors.success }]}>∞</Text>
                    <Text style={styles.usageStatLabel}>Unlimited</Text>
                  </View>
                </>
              )}
              {canceledButStillActive && (
                <>
                  <View style={styles.usageStatDivider} />
                  <View style={styles.usageStat}>
                    <Text style={[styles.usageStatValue, { color: "#F59E0B" }]}>
                      {daysUntilAccessEnds}
                    </Text>
                    <Text style={styles.usageStatLabel}>Days Left</Text>
                  </View>
                  <View style={styles.usageStatDivider} />
                  <View style={styles.usageStat}>
                    <Text style={[styles.usageStatValue, { color: "#F59E0B" }]}>∞</Text>
                    <Text style={styles.usageStatLabel}>Until Expiry</Text>
                  </View>
                </>
              )}
              {hasActiveTrial && !isTrialExpired && !hasActiveSubscription && (
                <>
                  <View style={styles.usageStatDivider} />
                  <View style={styles.usageStat}>
                    <Text style={[styles.usageStatValue, trialDaysRemaining <= 2 && { color: Colors.warning }]}>
                      {trialDaysRemaining}
                    </Text>
                    <Text style={styles.usageStatLabel}>Days Left</Text>
                  </View>
                  <View style={styles.usageStatDivider} />
                  <View style={styles.usageStat}>
                    <Text style={styles.usageStatValue}>∞</Text>
                    <Text style={styles.usageStatLabel}>Unlimited</Text>
                  </View>
                </>
              )}
              {isTrialExpired && !hasActiveSubscription && (
                <>
                  <View style={styles.usageStatDivider} />
                  <View style={styles.usageStat}>
                    <Text style={[styles.usageStatValue, { color: Colors.error }]}>0</Text>
                    <Text style={styles.usageStatLabel}>Days Left</Text>
                  </View>
                </>
              )}
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

      {/* Meeting Type Modal */}
      <MeetingTypeModal
        visible={showTypeModal}
        onClose={() => {
          setShowTypeModal(false);
          setEditingType(null);
        }}
        type={editingType}
        existingTypes={meetingTypes}
        onSave={handleSaveType}
        onDelete={handleDeleteType}
        isSaving={isCreatingType || isUpdatingType}
        isDeleting={isDeletingType}
      />

      {/* Contact Category Modal */}
      <ContactCategoryModal
        visible={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setEditingCategory(null);
        }}
        category={editingCategory}
        existingCategories={contactCategories}
        onSave={handleSaveCategory}
        onDelete={handleDeleteCategory}
        isSaving={isCreatingCategory || isUpdatingCategory}
        isDeleting={isDeletingCategory}
      />

      {/* Billing Settings Modal */}
      <DraggableBottomSheet
        visible={showBillingModal}
        onClose={() => setShowBillingModal(false)}
        title="Billing Settings"
        height={65}
      >
        {/* Hourly Rate */}
        <View style={billingStyles.fieldGroup}>
          <Text style={billingStyles.fieldLabel}>Default Hourly Rate</Text>
          <View style={billingStyles.rateInputWrapper}>
            <Text style={billingStyles.currencyPrefix}>{selectedCurrency}</Text>
            <TextInput
              style={billingStyles.rateInput}
              value={hourlyRateInput}
              onChangeText={setHourlyRateInput}
              placeholder="150.00"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
            />
            <Text style={billingStyles.rateSuffix}>/hr</Text>
          </View>
          <Text style={billingStyles.fieldHint}>
            This rate will be used as default when marking meetings as billable
          </Text>
        </View>

        {/* Currency Symbol */}
        <View style={billingStyles.fieldGroup}>
          <Text style={billingStyles.fieldLabel}>Currency Symbol</Text>
          <View style={billingStyles.currencyGrid}>
            {CURRENCY_SYMBOLS.map((currency) => (
              <Pressable
                key={currency.symbol}
                style={[
                  billingStyles.currencyOption,
                  selectedCurrency === currency.symbol && billingStyles.currencyOptionSelected,
                ]}
                onPress={() => {
                  setSelectedCurrency(currency.symbol);
                  if (Platform.OS !== "web") {
                    lightImpact();
                  }
                }}
              >
                <Text style={[
                  billingStyles.currencySymbol,
                  selectedCurrency === currency.symbol && billingStyles.currencySymbolSelected,
                ]}>
                  {currency.symbol}
                </Text>
                <Text style={[
                  billingStyles.currencyName,
                  selectedCurrency === currency.symbol && billingStyles.currencyNameSelected,
                ]} numberOfLines={1}>
                  {currency.name.split(' ')[0]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Footer */}
        <View style={billingStyles.footer}>
          <Pressable
            style={[billingStyles.saveButton, isSavingBilling && billingStyles.saveButtonDisabled]}
            onPress={handleSaveBilling}
            disabled={isSavingBilling}
          >
            {isSavingBilling ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <Text style={billingStyles.saveButtonText}>Save Settings</Text>
            )}
          </Pressable>
        </View>
      </DraggableBottomSheet>
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
    fontWeight: "700",
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
    fontWeight: "700",
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
    cursor: "pointer",
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
  manageSubRow: {
    paddingRight: 24,
  },
  dangerText: {
    color: Colors.error,
  },
  toggleIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
  },
  toggleIndicatorActive: {
    backgroundColor: Colors.accentLight,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textMuted,
  },
  toggleTextActive: {
    color: Colors.text,
  },
  disclaimer: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  // Billing section styles
  billingInfo: {
    flex: 1,
  },
  billingValue: {
    fontSize: 13,
    color: Colors.success,
    fontWeight: "600",
    marginTop: 2,
  },
  billingHint: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  usageStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  usageStat: {
    alignItems: "center",
    flex: 1,
  },
  usageStatValue: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
  },
  usageStatLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  usageStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.border,
  },
  // PRO subscriber styles
  proBadgeContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  cancelingBadgeContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  subscriptionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  proBadge: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFD700",
    letterSpacing: 0.5,
  },
  cancelingBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  cancelingBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#F59E0B",
    letterSpacing: 0.5,
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
    fontWeight: "600",
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
    fontWeight: "600",
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
    fontWeight: "600",
    color: Colors.success || "#34C759",
    marginBottom: 8,
  },
  thankYouSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  // Meeting Types styles
  loadingRow: {
    paddingVertical: 24,
    alignItems: "center",
  },
  typeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  typeRowLast: {
    borderBottomWidth: 0,
  },
  typeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  typeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  typeName: {
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  typeActionButton: {
    padding: 8,
  },
  addTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  addTypeText: {
    fontSize: 15,
    color: Colors.accentLight,
    fontWeight: "600",
  },
});

// Modal Styles
const modalStyles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    width: "100%",
    maxWidth: 400,
    maxHeight: "90%",
    overflow: "hidden",
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
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    flexGrow: 0,
  },
  content: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  previewLabel: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  previewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  previewText: {
    fontSize: 13,
    fontWeight: "600",
  },
  footer: {
    padding: 20,
    paddingTop: 0,
    gap: 12,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: Colors.accentLight,
    borderRadius: 12,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: "rgba(255, 59, 48, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.error,
  },
});

// Billing Settings Styles
const billingStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  keyboardAvoid: {
    width: "100%",
  },
  container: {
    backgroundColor: '#1a1f2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: Platform.OS === "ios" ? 20 : 0,
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
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  fieldGroup: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  rateInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: '#252b3d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 16,
  },
  currencyPrefix: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.success,
    marginRight: 4,
  },
  rateInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: "600",
    color: '#ffffff',
  },
  rateSuffix: {
    fontSize: 16,
    color: Colors.textMuted,
    marginLeft: 4,
  },
  fieldHint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 8,
  },
  currencyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  currencyOption: {
    backgroundColor: '#252b3d',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: '#374151',
    minWidth: 70,
    alignItems: "center",
  },
  currencyOptionSelected: {
    borderColor: Colors.accentLight,
    backgroundColor: Colors.accentLight + '15',
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  currencySymbolSelected: {
    color: Colors.accentLight,
  },
  currencyName: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  currencyNameSelected: {
    color: Colors.accentLight,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#374151',
    padding: 20,
  },
  saveButton: {
    backgroundColor: Colors.accentLight,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
});
