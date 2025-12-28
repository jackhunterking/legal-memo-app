/**
 * Meeting Detail Screen
 * 
 * Displays meeting details, audio playback, and transcript.
 * 
 * Per Expo Audio documentation:
 * - Uses useAudioPlayer hook for audio playback
 * - Uses useAudioPlayerStatus for real-time status updates
 * - Properly manages audio lifecycle
 * 
 * @see .cursor/expo-audio-documentation.md
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from "expo-audio";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronLeft,
  Play,
  Pause,
  Trash2,
  AlertTriangle,
  Search,
  X,
  Clock,
  RefreshCw,
  Share2,
  Tag,
  Check,
  ChevronRight,
  MoreVertical,
  Edit3,
  Link,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ExternalLink,
  Flag,
} from "lucide-react-native";
import { lightImpact, successNotification } from "@/lib/haptics";
import { useMeetingDetails, useMeetings, useMeetingShares } from "@/contexts/MeetingContext";
import { useContacts } from "@/contexts/ContactContext";
import { useUsage } from "@/contexts/UsageContext";
import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";
import { 
  formatDuration, 
  formatTimestamp, 
  getStatusInfo, 
  MeetingType, 
  ContactWithCategory, 
  formatContactName, 
  getContactInitials,
  formatCurrency,
  formatBillableHours,
  secondsToHoursRoundUp,
  calculateBillableAmount,
  formatDurationForBilling,
  getDurationColor,
  formatCompactDateTime,
  formatRecordingTimeline,
  MeetingShareLink,
} from "@/types";
// Clipboard utility that works across platforms
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (Platform.OS === 'web') {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      return false;
    } else {
      // Use expo-clipboard for native platforms
      await Clipboard.setStringAsync(text);
      return true;
    }
  } catch (error) {
    console.error('[Clipboard] Error copying to clipboard:', error);
    return false;
  }
};
import { PLAYBACK_AUDIO_MODE } from "@/lib/audio-config";
import { User, Plus, DollarSign } from "lucide-react-native";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "react-native";
import DraggableBottomSheet from "@/components/DraggableBottomSheet";

/**
 * Format speaker label from "A", "B", "C" to "Speaker A", "Speaker B", "Speaker C"
 */
const formatSpeakerLabel = (speaker: string): string => {
  // If already formatted (e.g., "Speaker A"), return as is
  if (speaker.toLowerCase().startsWith('speaker')) {
    return speaker;
  }
  // Otherwise, format single letter to "Speaker X"
  return `Speaker ${speaker}`;
};

/**
 * Get color scheme for each speaker
 */
const getSpeakerColors = (speaker: string): { accent: string; text: string } => {
  const formattedSpeaker = formatSpeakerLabel(speaker).toUpperCase();
  
  // Check the last character to determine which speaker (A, B, C, etc.)
  if (formattedSpeaker.endsWith('A')) {
    return { accent: '#3b82f6', text: '#60a5fa' }; // Blue
  } else if (formattedSpeaker.endsWith('B')) {
    return { accent: '#ef4444', text: '#f87171' }; // Red
  } else if (formattedSpeaker.endsWith('C')) {
    return { accent: '#8b5cf6', text: '#a78bfa' }; // Purple
  } else if (formattedSpeaker.endsWith('D')) {
    return { accent: '#10b981', text: '#34d399' }; // Green
  } else {
    return { accent: '#f59e0b', text: '#fbbf24' }; // Orange (for others)
  }
};

/**
 * Transcript Bottom Sheet Component
 * Displays full transcript with search and seek functionality
 */
const TranscriptBottomSheet = ({
  visible,
  onClose,
  segments,
  onSeek,
}: {
  visible: boolean;
  onClose: () => void;
  segments?: Array<{ id: string; speaker: string; text: string; start_ms: number; end_ms: number }>;
  onSeek?: (ms: number) => void;
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSegments = segments?.filter((segment) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const speakerLabel = formatSpeakerLabel(segment.speaker).toLowerCase();
    return segment.text.toLowerCase().includes(query) || speakerLabel.includes(query);
  }) || [];

  return (
    <DraggableBottomSheet
      visible={visible}
      onClose={onClose}
      title="Transcript"
      height={92}
    >
      {/* Search Bar */}
      <View style={styles.transcriptSearchContainer}>
        <Search size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.transcriptSearchInput}
          placeholder="Search in transcript..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")}>
            <X size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Transcript Segments */}
      {filteredSegments.length > 0 ? (
        filteredSegments.map((segment) => (
          <Pressable
            key={segment.id}
            style={styles.transcriptSegmentCard}
            onPress={() => {
              if (onSeek) onSeek(segment.start_ms);
              lightImpact();
            }}
          >
            <View style={[styles.segmentAccentBar, { backgroundColor: getSpeakerColors(segment.speaker).accent }]} />
            <View style={styles.segmentContent}>
              <Text style={[styles.transcriptSpeakerLabel, { color: getSpeakerColors(segment.speaker).text }]}>
                {formatSpeakerLabel(segment.speaker)}
              </Text>
              <Text style={styles.transcriptSegmentText}>{segment.text}</Text>
              <Text style={styles.transcriptTimestamp}>{formatTimestamp(segment.start_ms)}</Text>
            </View>
          </Pressable>
        ))
      ) : (
        <Text style={styles.noDataText}>
          {searchQuery.trim() ? "No matches found" : "No transcript available"}
        </Text>
      )}
    </DraggableBottomSheet>
  );
};

/**
 * Meeting Type Selector Modal
 * Allows user to select or clear a meeting type
 */
const TypeSelectorModal = ({
  visible,
  onClose,
  types,
  currentTypeId,
  onSelect,
  onManageTypes,
  isUpdating,
}: {
  visible: boolean;
  onClose: () => void;
  types: MeetingType[];
  currentTypeId: string | null;
  onSelect: (typeId: string | null) => Promise<void>;
  onManageTypes: () => void;
  isUpdating: boolean;
}) => {
  return (
    <DraggableBottomSheet
      visible={visible}
      onClose={onClose}
      title="Meeting Type"
      height={60}
    >
      {/* No Type Option */}
      <Pressable
        style={[
          typeSelectorStyles.typeOption,
          currentTypeId === null && typeSelectorStyles.typeOptionSelected,
        ]}
        onPress={() => onSelect(null)}
        disabled={isUpdating}
      >
        <View style={typeSelectorStyles.typeLeft}>
          <View style={[typeSelectorStyles.typeDot, { backgroundColor: Colors.textMuted }]} />
          <Text style={typeSelectorStyles.typeName}>No Type</Text>
        </View>
        {currentTypeId === null && (
          <Check size={20} color={Colors.accentLight} />
        )}
      </Pressable>

      {/* Type Options */}
      {types.map((type) => (
        <Pressable
          key={type.id}
          style={[
            typeSelectorStyles.typeOption,
            currentTypeId === type.id && typeSelectorStyles.typeOptionSelected,
          ]}
          onPress={() => onSelect(type.id)}
          disabled={isUpdating}
        >
          <View style={typeSelectorStyles.typeLeft}>
            <View style={[typeSelectorStyles.typeDot, { backgroundColor: type.color }]} />
            <Text style={typeSelectorStyles.typeName}>{type.name}</Text>
          </View>
          {currentTypeId === type.id && (
            <Check size={20} color={Colors.accentLight} />
          )}
        </Pressable>
      ))}

      {/* Footer Button */}
      <View style={typeSelectorStyles.footer}>
        <Pressable
          style={typeSelectorStyles.manageTypesButton}
          onPress={onManageTypes}
        >
          <Text style={typeSelectorStyles.manageTypesText}>
            Add or Edit Types in Settings
          </Text>
          <ChevronRight size={18} color={Colors.accentLight} />
        </Pressable>
      </View>

      {isUpdating && (
        <View style={typeSelectorStyles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.accentLight} />
        </View>
      )}
    </DraggableBottomSheet>
  );
};

/**
 * Contact Selector Modal
 * Allows user to select or clear a contact for the meeting
 */
const ContactSelectorModal = ({
  visible,
  onClose,
  contacts,
  currentContactId,
  onSelect,
  onAddContact,
  isUpdating,
}: {
  visible: boolean;
  onClose: () => void;
  contacts: ContactWithCategory[];
  currentContactId: string | null;
  onSelect: (contactId: string | null) => Promise<void>;
  onAddContact: () => void;
  isUpdating: boolean;
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  
  const filteredContacts = contacts.filter((contact) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const fullName = formatContactName(contact).toLowerCase();
    const company = contact.company?.toLowerCase() || '';
    return fullName.includes(query) || company.includes(query);
  });

  return (
    <DraggableBottomSheet
      visible={visible}
      onClose={onClose}
      title="Contact"
      height={75}
    >
      {/* Search */}
      <View style={contactSelectorStyles.searchContainer}>
        <Search size={18} color={Colors.textMuted} />
        <TextInput
          style={contactSelectorStyles.searchInput}
          placeholder="Search contacts..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")}>
            <X size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* No Contact Option */}
      <Pressable
        style={[
          contactSelectorStyles.contactOption,
          currentContactId === null && contactSelectorStyles.contactOptionSelected,
        ]}
        onPress={() => onSelect(null)}
        disabled={isUpdating}
      >
        <View style={contactSelectorStyles.contactLeft}>
          <View style={[contactSelectorStyles.contactAvatar, { backgroundColor: Colors.textMuted }]}>
            <User size={16} color="#fff" />
          </View>
          <Text style={contactSelectorStyles.contactName}>No Contact</Text>
        </View>
        {currentContactId === null && (
          <Check size={20} color={Colors.accentLight} />
        )}
      </Pressable>

      {/* Contact Options */}
      {filteredContacts.map((contact) => (
        <Pressable
          key={contact.id}
          style={[
            contactSelectorStyles.contactOption,
            currentContactId === contact.id && contactSelectorStyles.contactOptionSelected,
          ]}
          onPress={() => onSelect(contact.id)}
          disabled={isUpdating}
        >
          <View style={contactSelectorStyles.contactLeft}>
            <View style={[contactSelectorStyles.contactAvatar, { backgroundColor: contact.category?.color || Colors.accentLight }]}>
              <Text style={contactSelectorStyles.contactInitials}>
                {getContactInitials(contact)}
              </Text>
            </View>
            <View style={contactSelectorStyles.contactInfo}>
              <Text style={contactSelectorStyles.contactName}>{formatContactName(contact)}</Text>
              {contact.category && (
                <View style={contactSelectorStyles.contactCategoryRow}>
                  <View style={[contactSelectorStyles.contactCategoryDot, { backgroundColor: contact.category.color }]} />
                  <Text style={contactSelectorStyles.contactCategory}>{contact.category.name}</Text>
                </View>
              )}
              {contact.company && (
                <Text style={contactSelectorStyles.contactCompany}>{contact.company}</Text>
              )}
            </View>
          </View>
          {currentContactId === contact.id && (
            <Check size={20} color={Colors.accentLight} />
          )}
        </Pressable>
      ))}

      {filteredContacts.length === 0 && searchQuery.trim() && (
        <Text style={contactSelectorStyles.noResults}>No contacts found</Text>
      )}

      {/* Footer Button */}
      <View style={contactSelectorStyles.footer}>
        <Pressable
          style={contactSelectorStyles.addContactButton}
          onPress={onAddContact}
        >
          <Plus size={18} color={Colors.accentLight} />
          <Text style={contactSelectorStyles.addContactText}>
            Add New Contact
          </Text>
        </Pressable>
      </View>

      {isUpdating && (
        <View style={contactSelectorStyles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.accentLight} />
        </View>
      )}
    </DraggableBottomSheet>
  );
};

/**
 * Billable Editor Modal
 * Allows user to toggle billable status and edit hours/amount
 */
const BillableEditorModal = ({
  visible,
  onClose,
  meeting,
  hourlyRate,
  currencySymbol,
  onSave,
  isSaving,
  onNavigateToSettings,
}: {
  visible: boolean;
  onClose: () => void;
  meeting: {
    id: string;
    duration_seconds: number;
    is_billable: boolean;
    billable_hours: number | null;
    billable_amount: number | null;
    billable_amount_manual: boolean;
  };
  hourlyRate: number | null;
  currencySymbol: string;
  onSave: (data: {
    isBillable: boolean;
    billableHours: number | null;
    billableAmount: number | null;
    isManualAmount: boolean;
  }) => Promise<void>;
  isSaving: boolean;
  onNavigateToSettings: () => void;
}) => {
  // Local state for editing
  const [hoursInput, setHoursInput] = useState('');
  const [minutesInput, setMinutesInput] = useState('');
  const [useDefaultRate, setUseDefaultRate] = useState(true);
  const [manualRateInput, setManualRateInput] = useState('');

  // Default hours from duration (rounded up to nearest minute)
  const defaultHours = secondsToHoursRoundUp(meeting.duration_seconds);

  // Initialize values when modal opens
  useEffect(() => {
    if (visible) {
      // Set hours and minutes - use saved value or default from duration
      const totalHours = meeting.billable_hours ?? defaultHours;
      if (totalHours > 0) {
        const h = Math.floor(totalHours);
        const m = Math.round((totalHours - h) * 60);
        setHoursInput(h.toString());
        setMinutesInput(m.toString());
      } else {
        setHoursInput('');
        setMinutesInput('');
      }
      
      // Default to using the profile's hourly rate
      setUseDefaultRate(true);
      // Pre-fill manual rate with default rate for convenience
      if (hourlyRate) {
        setManualRateInput(hourlyRate.toString());
      } else {
        setManualRateInput('');
      }
    }
  }, [visible, meeting, defaultHours, hourlyRate]);

  // Convert hours and minutes to decimal hours
  const getTotalHours = () => {
    const h = parseInt(hoursInput) || 0;
    const m = parseInt(minutesInput) || 0;
    return h + (m / 60);
  };

  // Get current rate (either default or manual)
  const getCurrentRate = () => {
    if (useDefaultRate) {
      return hourlyRate || 0;
    }
    return parseFloat(manualRateInput) || 0;
  };

  // Handle hours change
  const handleHoursChange = (value: string) => {
    setHoursInput(value);
  };

  // Handle minutes change
  const handleMinutesChange = (value: string) => {
    // Limit to 0-59
    const numValue = parseInt(value) || 0;
    if (numValue > 59) {
      setMinutesInput('59');
    } else {
      setMinutesInput(value);
    }
  };

  // Handle manual rate change
  const handleManualRateChange = (value: string) => {
    setManualRateInput(value);
  };

  // Toggle between default and manual rate
  const handleRateToggle = (useDefault: boolean) => {
    setUseDefaultRate(useDefault);
    // When switching to manual, pre-fill with default rate if available
    if (!useDefault && hourlyRate && !manualRateInput) {
      setManualRateInput(hourlyRate.toString());
    }
  };

  // Handle save - amount is calculated from time × rate
  const handleSave = async () => {
    const totalHours = getTotalHours();
    const rate = getCurrentRate();
    const calculatedAmount = calculateBillableAmount(totalHours, rate);
    
    await onSave({
      isBillable: true, // Always true since modal is only opened when billable is enabled
      billableHours: totalHours > 0 ? totalHours : null,
      billableAmount: calculatedAmount > 0 ? calculatedAmount : null,
      isManualAmount: false,
    });
  };

  // Calculate display values
  const totalHours = getTotalHours();
  const currentRate = getCurrentRate();
  const calculatedAmount = calculateBillableAmount(totalHours, currentRate);
  const calculationText = currentRate > 0 && totalHours > 0
    ? `${formatBillableHours(totalHours)} × ${formatCurrency(currentRate, currencySymbol)}/hr`
    : null;

  return (
    <DraggableBottomSheet
      visible={visible}
      onClose={onClose}
      title="Edit Billing"
      height={85}
    >
      {currentRate === 0 && (
        <Text style={billableStyles.headerSubtext}>
          Set an hourly rate to calculate billing amount
        </Text>
      )}

      {/* Recorded Duration - Prominent Display */}
      <View style={billableStyles.recordedSection}>
        <Text style={billableStyles.recordedLabel}>Recorded Duration</Text>
        <Text style={billableStyles.recordedValue}>
          {formatDurationForBilling(meeting.duration_seconds)}
        </Text>
      </View>

      {/* Time Input - Hours and Minutes */}
      <View style={billableStyles.fieldGroup}>
        <Text style={billableStyles.fieldLabel}>Billable Time</Text>
        <View style={billableStyles.timeInputRow}>
          <View style={billableStyles.timeInputContainer}>
            <TextInput
              style={billableStyles.timeInput}
              value={hoursInput}
              onChangeText={handleHoursChange}
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              maxLength={3}
            />
            <Text style={billableStyles.timeLabel}>hours</Text>
          </View>
          <Text style={billableStyles.timeSeparator}>:</Text>
          <View style={billableStyles.timeInputContainer}>
            <TextInput
              style={billableStyles.timeInput}
              value={minutesInput}
              onChangeText={handleMinutesChange}
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={billableStyles.timeLabel}>minutes</Text>
          </View>
        </View>
      </View>

      {/* Hourly Rate Section */}
      <View style={billableStyles.fieldGroup}>
        <Text style={billableStyles.fieldLabel}>Hourly Rate</Text>
        
        {/* Rate Option Tabs */}
        <View style={billableStyles.rateOptionTabs}>
          <Pressable
            style={[
              billableStyles.rateOptionTab,
              useDefaultRate && billableStyles.rateOptionTabActive,
            ]}
            onPress={() => handleRateToggle(true)}
          >
            <Text style={[
              billableStyles.rateOptionTabText,
              useDefaultRate && billableStyles.rateOptionTabTextActive,
            ]}>
              Default
            </Text>
          </Pressable>
          <Pressable
            style={[
              billableStyles.rateOptionTab,
              !useDefaultRate && billableStyles.rateOptionTabActive,
            ]}
            onPress={() => handleRateToggle(false)}
          >
            <Text style={[
              billableStyles.rateOptionTabText,
              !useDefaultRate && billableStyles.rateOptionTabTextActive,
            ]}>
              Custom
            </Text>
          </Pressable>
        </View>

        {/* Default Rate Display */}
        {useDefaultRate && (
          <View style={billableStyles.defaultRateDisplay}>
            {hourlyRate ? (
              <Text style={billableStyles.defaultRateValue}>
                {formatCurrency(hourlyRate, currencySymbol)}/hr
              </Text>
            ) : (
              <Pressable
                style={billableStyles.setDefaultRateButton}
                onPress={() => {
                  onClose();
                  onNavigateToSettings();
                }}
              >
                <Text style={billableStyles.setDefaultRateText}>
                  Set Default Hourly Rate
                </Text>
                <ChevronRight size={18} color={Colors.accentLight} />
              </Pressable>
            )}
          </View>
        )}

        {/* Manual Rate Input */}
        {!useDefaultRate && (
          <View style={billableStyles.rateInputWrapper}>
            <Text style={billableStyles.currencyPrefix}>{currencySymbol}</Text>
            <TextInput
              style={billableStyles.rateInput}
              value={manualRateInput}
              onChangeText={handleManualRateChange}
              placeholder="0.00"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
            />
            <Text style={billableStyles.rateSuffix}>/hr</Text>
          </View>
        )}
      </View>

      {/* Preview Card - Auto-calculated (only show when rate is set) */}
      {totalHours > 0 && calculatedAmount > 0 && (
        <View style={billableStyles.previewCard}>
          <Text style={billableStyles.previewLabel}>Total Amount</Text>
          <Text style={billableStyles.previewAmount}>
            {formatCurrency(calculatedAmount, currencySymbol)}
          </Text>
          <Text style={billableStyles.previewCalculation}>
            {calculationText}
          </Text>
        </View>
      )}

      {/* Save Button */}
      <View style={billableStyles.footerInScroll}>
        <Pressable
          style={[billableStyles.saveButton, isSaving && billableStyles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={Colors.text} />
          ) : (
            <Text style={billableStyles.saveButtonText}>Save Changes</Text>
          )}
        </Pressable>
      </View>
    </DraggableBottomSheet>
  );
};

/**
 * Speaker Feedback Modal Component
 * Allows users to report speaker diarization issues
 */
const SpeakerFeedbackModal = ({
  visible,
  onClose,
  meeting,
  onSubmit,
  isSubmitting,
}: {
  visible: boolean;
  onClose: () => void;
  meeting: {
    id: string;
    expected_speakers: number;
    detected_speakers: number | null;
    speaker_mismatch: boolean;
  };
  onSubmit: (feedbackType?: string, notes?: string) => Promise<void>;
  isSubmitting: boolean;
}) => {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedType(null);
      setNotes('');
      setSubmitted(false);
    }
  }, [visible]);

  const feedbackOptions = [
    { id: 'wrong_speaker_count', label: 'Wrong speaker count' },
    { id: 'speakers_merged', label: 'Speakers incorrectly merged' },
    { id: 'speakers_split', label: 'Speaker incorrectly split' },
    { id: 'wrong_attribution', label: 'Wrong speaker attribution' },
    { id: 'other', label: 'Other' },
  ];

  const handleSubmit = async () => {
    // Require at least feedback type OR notes
    const hasNotes = notes.trim().length > 0;
    if (!selectedType && !hasNotes) {
      Alert.alert('Input Required', 'Please select an issue type or provide notes.');
      return;
    }
    
    try {
      await onSubmit(selectedType || undefined, notes || undefined);
      setSubmitted(true);
      // Auto close after success
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('[SpeakerFeedback] Error submitting:', error);
      Alert.alert('Error', 'Failed to submit feedback. Please try again.');
    }
  };

  return (
    <DraggableBottomSheet
      visible={visible}
      onClose={onClose}
      title="Report Issue"
      height={75}
    >
      {submitted ? (
        <View style={feedbackStyles.successContainer}>
          <View style={feedbackStyles.successIcon}>
            <Check size={32} color={Colors.success} />
          </View>
          <Text style={feedbackStyles.successTitle}>Thank You!</Text>
          <Text style={feedbackStyles.successMessage}>
            Your feedback helps us improve speaker detection accuracy.
          </Text>
        </View>
      ) : (
        <>
          {/* Speaker info */}
          {meeting.detected_speakers !== null && (
            <View style={feedbackStyles.infoCard}>
              <Text style={feedbackStyles.infoLabel}>Speaker Detection</Text>
              <Text style={feedbackStyles.infoValue}>
                Expected: {meeting.expected_speakers} | Detected: {meeting.detected_speakers}
              </Text>
            </View>
          )}

          {/* Feedback type selection */}
          <Text style={feedbackStyles.sectionLabel}>What's the issue? (optional)</Text>
          <View style={feedbackStyles.optionsContainer}>
            {feedbackOptions.map((option) => (
              <Pressable
                key={option.id}
                style={[
                  feedbackStyles.optionButton,
                  selectedType === option.id && feedbackStyles.optionButtonSelected,
                ]}
                onPress={() => setSelectedType(option.id)}
              >
                <View style={[
                  feedbackStyles.radioOuter,
                  selectedType === option.id && feedbackStyles.radioOuterSelected,
                ]}>
                  {selectedType === option.id && <View style={feedbackStyles.radioInner} />}
                </View>
                <Text style={[
                  feedbackStyles.optionText,
                  selectedType === option.id && feedbackStyles.optionTextSelected,
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Notes input */}
          <Text style={feedbackStyles.sectionLabel}>Additional notes (optional)</Text>
          <TextInput
            style={feedbackStyles.notesInput}
            placeholder="Describe the issue..."
            placeholderTextColor={Colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Submit button */}
          <Pressable
            style={[
              feedbackStyles.submitButton,
              ((!selectedType && notes.trim().length === 0) || isSubmitting) && feedbackStyles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={(!selectedType && notes.trim().length === 0) || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <Text style={feedbackStyles.submitButtonText}>Submit Feedback</Text>
            )}
          </Pressable>
        </>
      )}
    </DraggableBottomSheet>
  );
};

// Speaker Feedback Modal styles
const feedbackStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    padding: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.warning}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 10,
  },
  optionsContainer: {
    marginBottom: 16,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: Colors.surfaceLight,
  },
  optionButtonSelected: {
    backgroundColor: `${Colors.accentLight}15`,
    borderWidth: 1,
    borderColor: Colors.accentLight,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioOuterSelected: {
    borderColor: Colors.accentLight,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accentLight,
  },
  optionText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  optionTextSelected: {
    color: Colors.text,
    fontWeight: '500',
  },
  notesInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    minHeight: 80,
    marginBottom: 16,
  },
  submitButton: {
    backgroundColor: Colors.accentLight,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.success}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

/**
 * Quick Actions Menu Component
 * Bottom sheet with quick access to Share, Edit Name, Search Transcript, and Delete
 */
const QuickActionsMenu = ({
  visible,
  onClose,
  onShare,
  onEditName,
  onSearchTranscript,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  onShare: () => void;
  onEditName: () => void;
  onSearchTranscript: () => void;
  onDelete: () => void;
}) => {
  return (
    <DraggableBottomSheet
      visible={visible}
      onClose={onClose}
      title="Quick Actions"
      height={40}
    >
      <View style={quickActionsStyles.actionsList}>
        <Pressable 
          style={quickActionsStyles.actionItem} 
          onPress={() => { 
            // Close modal first, then trigger share
            onClose();
            onShare();
          }}
        >
          <View style={quickActionsStyles.actionIcon}>
            <Share2 size={20} color={Colors.text} />
          </View>
          <Text style={quickActionsStyles.actionText}>Share Meeting</Text>
        </Pressable>

        <Pressable 
          style={quickActionsStyles.actionItem} 
          onPress={() => { 
            onEditName(); 
            onClose(); 
          }}
        >
          <View style={quickActionsStyles.actionIcon}>
            <Edit3 size={20} color={Colors.text} />
          </View>
          <Text style={quickActionsStyles.actionText}>Edit Name</Text>
        </Pressable>

        <Pressable 
          style={quickActionsStyles.actionItem} 
          onPress={() => { 
            onSearchTranscript(); 
          }}
        >
          <View style={quickActionsStyles.actionIcon}>
            <Search size={20} color={Colors.text} />
          </View>
          <Text style={quickActionsStyles.actionText}>Search Transcript</Text>
        </Pressable>

        <Pressable 
          style={quickActionsStyles.actionItem} 
          onPress={() => { 
            onDelete(); 
            onClose(); 
          }}
        >
          <View style={quickActionsStyles.actionIcon}>
            <Trash2 size={20} color={Colors.error} />
          </View>
          <Text style={[quickActionsStyles.actionText, quickActionsStyles.actionTextDelete]}>
            Delete Meeting
          </Text>
        </Pressable>
      </View>
    </DraggableBottomSheet>
  );
};

/**
 * Edit Name Modal Component
 * Centered modal for editing meeting title
 */
const EditNameModal = ({
  visible,
  currentTitle,
  onClose,
  onSave,
  isSaving,
}: {
  visible: boolean;
  currentTitle: string;
  onClose: () => void;
  onSave: (newTitle: string) => Promise<void>;
  isSaving: boolean;
}) => {
  const [title, setTitle] = useState(currentTitle);

  useEffect(() => {
    if (visible) {
      setTitle(currentTitle);
    }
  }, [visible, currentTitle]);

  const handleSave = async () => {
    if (title.trim() && title !== currentTitle) {
      await onSave(title.trim());
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={editNameStyles.overlay}
      >
        <Pressable style={editNameStyles.backdrop} onPress={onClose} />
        <View style={editNameStyles.container}>
          <Text style={editNameStyles.title}>Edit Meeting Name</Text>
          <TextInput
            style={editNameStyles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Enter meeting name"
            placeholderTextColor={Colors.textMuted}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <View style={editNameStyles.buttonRow}>
            <Pressable 
              style={[editNameStyles.button, editNameStyles.cancelButton]} 
              onPress={onClose}
            >
              <Text style={editNameStyles.buttonText}>Cancel</Text>
            </Pressable>
            <Pressable 
              style={[
                editNameStyles.button, 
                editNameStyles.saveButton, 
                isSaving && editNameStyles.saveButtonDisabled
              ]} 
              onPress={handleSave}
              disabled={isSaving || !title.trim()}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={editNameStyles.buttonText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

/**
 * Share Meeting Modal Component
 * Allows creating and managing share links with optional password protection
 */
const ShareMeetingModal = ({
  visible,
  onClose,
  meetingId,
  meetingTitle,
  shares,
  isLoadingShares,
  onCreateShare,
  onToggleShare,
  onDeleteShare,
  isCreating,
  isToggling,
}: {
  visible: boolean;
  onClose: () => void;
  meetingId: string;
  meetingTitle: string;
  shares: MeetingShareLink[];
  isLoadingShares: boolean;
  onCreateShare: (password?: string) => Promise<MeetingShareLink>;
  onToggleShare: (shareId: string, isActive: boolean) => Promise<void>;
  onDeleteShare: (shareId: string) => Promise<void>;
  isCreating: boolean;
  isToggling: boolean;
}) => {
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newShareUrl, setNewShareUrl] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setUsePassword(false);
      setPassword('');
      setShowPassword(false);
      setNewShareUrl(null);
    }
  }, [visible]);

  const handleCreateShare = async () => {
    try {
      const shareLink = await onCreateShare(usePassword ? password : undefined);
      setNewShareUrl(shareLink.shareUrl);
      // Auto-copy to clipboard
      await handleCopy(shareLink.shareUrl, shareLink.id);
      // Reset form
      setPassword('');
      setUsePassword(false);
    } catch (error) {
      console.error('[ShareModal] Error creating share:', error);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Failed to create share link. Please try again.');
      }
    }
  };

  const handleCopy = async (url: string, shareId: string) => {
    try {
      const success = await copyToClipboard(url);
      if (success) {
        setCopiedId(shareId);
        successNotification();
        // Reset copied state after 2 seconds
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch (error) {
      console.error('[ShareModal] Error copying to clipboard:', error);
    }
  };

  const handleOpenLink = async (url: string) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      await Linking.openURL(url);
    }
  };

  const formatShareDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleDeleteShare = (shareId: string) => {
    if (Platform.OS === 'web') {
      if (confirm('Delete this share link? Anyone with this link will no longer be able to access the meeting.')) {
        onDeleteShare(shareId);
      }
    } else {
      Alert.alert(
        'Delete Share Link',
        'Anyone with this link will no longer be able to access the meeting.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => onDeleteShare(shareId) },
        ]
      );
    }
  };

  return (
    <DraggableBottomSheet
      visible={visible}
      onClose={onClose}
      title="Share Meeting"
      height={85}
    >
      {/* New Share Link Section */}
      <View style={shareModalStyles.section}>
        <Text style={shareModalStyles.sectionTitle}>Create New Link</Text>
        <Text style={shareModalStyles.sectionSubtitle}>
          Anyone with the link can view "{meetingTitle}"
        </Text>

        {/* Password Toggle */}
        <View style={shareModalStyles.passwordRow}>
          <View style={shareModalStyles.passwordLeft}>
            <Lock size={18} color={Colors.textMuted} />
            <Text style={shareModalStyles.passwordLabel}>Password Protection</Text>
          </View>
          <Switch
            value={usePassword}
            onValueChange={setUsePassword}
            trackColor={{ false: Colors.border, true: Colors.accentLight + '80' }}
            thumbColor={usePassword ? Colors.accentLight : Colors.textMuted}
          />
        </View>

        {/* Password Input */}
        {usePassword && (
          <View style={shareModalStyles.passwordInputContainer}>
            <TextInput
              style={shareModalStyles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <Pressable 
              style={shareModalStyles.passwordToggle}
              onPress={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff size={20} color={Colors.textMuted} />
              ) : (
                <Eye size={20} color={Colors.textMuted} />
              )}
            </Pressable>
          </View>
        )}

        {/* Create Button */}
        <Pressable
          style={[
            shareModalStyles.createButton,
            (isCreating || (usePassword && !password.trim())) && shareModalStyles.createButtonDisabled,
          ]}
          onPress={handleCreateShare}
          disabled={isCreating || (usePassword && !password.trim())}
        >
          {isCreating ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Link size={18} color="#ffffff" />
              <Text style={shareModalStyles.createButtonText}>Create Share Link</Text>
            </>
          )}
        </Pressable>

        {/* Success Message */}
        {newShareUrl && (
          <View style={shareModalStyles.successBanner}>
            <Check size={18} color={Colors.success} />
            <Text style={shareModalStyles.successText}>Link created and copied to clipboard!</Text>
          </View>
        )}
      </View>

      {/* Existing Links Section */}
      {shares.length > 0 && (
        <View style={shareModalStyles.section}>
          <Text style={shareModalStyles.sectionTitle}>Active Links ({shares.length})</Text>
          
          {shares.map((share) => (
            <View 
              key={share.id} 
              style={[
                shareModalStyles.shareCard,
                !share.isActive && shareModalStyles.shareCardInactive,
              ]}
            >
              <View style={shareModalStyles.shareCardHeader}>
                <View style={shareModalStyles.shareInfo}>
                  {share.hasPassword ? (
                    <Lock size={14} color={Colors.warning} />
                  ) : (
                    <Unlock size={14} color={Colors.success} />
                  )}
                  <Text style={shareModalStyles.shareDate}>
                    Created {formatShareDate(share.createdAt)}
                  </Text>
                </View>
                <View style={shareModalStyles.shareStats}>
                  <Eye size={12} color={Colors.textMuted} />
                  <Text style={shareModalStyles.shareViews}>{share.viewCount}</Text>
                </View>
              </View>

              <View style={shareModalStyles.shareActions}>
                {/* Copy Button */}
                <Pressable
                  style={[
                    shareModalStyles.shareActionBtn,
                    copiedId === share.id && shareModalStyles.shareActionBtnActive,
                  ]}
                  onPress={() => handleCopy(share.shareUrl, share.id)}
                >
                  {copiedId === share.id ? (
                    <Check size={16} color={Colors.success} />
                  ) : (
                    <Copy size={16} color={Colors.text} />
                  )}
                </Pressable>

                {/* Open Link Button */}
                <Pressable
                  style={shareModalStyles.shareActionBtn}
                  onPress={() => handleOpenLink(share.shareUrl)}
                >
                  <ExternalLink size={16} color={Colors.text} />
                </Pressable>

                {/* Toggle Active Button */}
                <Pressable
                  style={shareModalStyles.shareActionBtn}
                  onPress={() => onToggleShare(share.id, !share.isActive)}
                  disabled={isToggling}
                >
                  {share.isActive ? (
                    <EyeOff size={16} color={Colors.warning} />
                  ) : (
                    <Eye size={16} color={Colors.success} />
                  )}
                </Pressable>

                {/* Delete Button */}
                <Pressable
                  style={shareModalStyles.shareActionBtn}
                  onPress={() => handleDeleteShare(share.id)}
                >
                  <Trash2 size={16} color={Colors.error} />
                </Pressable>
              </View>

              {!share.isActive && (
                <Text style={shareModalStyles.inactiveLabel}>Deactivated</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Loading State */}
      {isLoadingShares && shares.length === 0 && (
        <View style={shareModalStyles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors.accentLight} />
          <Text style={shareModalStyles.loadingText}>Loading share links...</Text>
        </View>
      )}
    </DraggableBottomSheet>
  );
};

export default function MeetingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: meeting, isLoading, refetch } = useMeetingDetails(id || null);
  const { 
    deleteMeeting, 
    retryProcessing, 
    isRetrying, 
    meetingTypes, 
    updateMeeting, 
    isUpdating, 
    updateMeetingBilling, 
    isUpdatingBilling,
    createMeetingShare,
    toggleMeetingShare,
    deleteMeetingShare,
    isCreatingShare,
    isTogglingShare,
    submitSpeakerFeedback,
    isSubmittingFeedback,
  } = useMeetings();
  const { contacts } = useContacts();
  const { profile } = useAuth();
  const { canAccessFeatures, isTrialExpired, hasActiveSubscription, hasActiveTrial } = useUsage();
  
  // Check if content is locked - trial expired and no subscription
  const isContentLocked = isTrialExpired && !hasActiveSubscription && !hasActiveTrial;
  
  // Fetch existing share links
  const { data: shares = [], isLoading: isLoadingShares, refetch: refetchShares } = useMeetingShares(id || null);

  // UI state
  const [showTranscript, setShowTranscript] = useState(false);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [showContactSelector, setShowContactSelector] = useState(false);
  const [showBillableEditor, setShowBillableEditor] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showEditName, setShowEditName] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSpeakerFeedback, setShowSpeakerFeedback] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  // Audio loading state
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioLoadError, setAudioLoadError] = useState(false);
  const [audioErrorMessage, setAudioErrorMessage] = useState<string | null>(null);

  // Blob URL ref for cleanup (web only)
  const blobUrlRef = useRef<string | null>(null);

  /**
   * Audio player using useAudioPlayer hook per Expo Audio docs
   * The hook manages the player's lifecycle automatically
   */
  const player = useAudioPlayer(audioUri ? { uri: audioUri } : null);
  
  /**
   * Real-time playback status using useAudioPlayerStatus hook
   * Returns playing, currentTime, duration, isBuffering, etc.
   */
  const status = useAudioPlayerStatus(player);

  const title = meeting?.title || "Meeting";
  const transcript = meeting?.transcript;
  const segments = meeting?.segments;

  /**
   * Load audio from Supabase Storage
   * Downloads the file and creates a URI for playback
   */
  const loadAudio = useCallback(async () => {
    // Prefer MP3 if available, fallback to raw audio
    const audioPath = meeting?.mp3_audio_path || meeting?.raw_audio_path;
    if (!audioPath || audioUri) return;

    try {
      console.log("[AudioPlayer] Loading audio from path:", audioPath);
      setIsAudioLoading(true);
      setAudioLoadError(false);
      setAudioErrorMessage(null);

      // Download audio from Supabase Storage
      const { data: audioBlob, error: downloadError } = await supabase.storage
        .from("meeting-audio")
        .download(audioPath);

      if (downloadError || !audioBlob) {
        console.error("[AudioPlayer] Download error:", downloadError);
        setAudioLoadError(true);
        setAudioErrorMessage(downloadError?.message || "Could not download audio");
        return;
      }

      console.log("[AudioPlayer] Audio downloaded, size:", audioBlob.size);

      let newAudioUri: string;

      if (Platform.OS === "web") {
        // On web, create a blob URL
        newAudioUri = URL.createObjectURL(audioBlob);
        blobUrlRef.current = newAudioUri;
      } else {
        // On native, convert to data URI
        const reader = new FileReader();
        newAudioUri = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
            } else {
              reject(new Error("Failed to convert audio to base64"));
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(audioBlob);
        });
      }

      // Configure audio mode for playback per Expo Audio docs
      await setAudioModeAsync(PLAYBACK_AUDIO_MODE);

      // Set the audio URI - this will update the player via useAudioPlayer
      setAudioUri(newAudioUri);
      
      setAudioLoadError(false);
      setAudioErrorMessage(null);
      console.log("[AudioPlayer] Audio loaded successfully");
    } catch (error) {
      console.error("[AudioPlayer] Failed to load audio:", error);
      setAudioLoadError(true);
      setAudioErrorMessage(error instanceof Error ? error.message : "Could not play audio");
    } finally {
      setIsAudioLoading(false);
    }
  }, [meeting?.mp3_audio_path, meeting?.raw_audio_path, audioUri]);

  /**
   * Load audio when meeting is ready
   */
  useEffect(() => {
    const canLoadAudio = 
      (meeting?.mp3_audio_path || meeting?.raw_audio_path) && 
      meeting?.status === "ready";

    if (canLoadAudio) {
      loadAudio();
    }
  }, [meeting?.mp3_audio_path, meeting?.raw_audio_path, meeting?.status, loadAudio]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Revoke blob URL on web
      if (blobUrlRef.current && Platform.OS === "web") {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  /**
   * Handle play/pause
   * Uses player.play() and player.pause() per Expo Audio docs
   */
  const handlePlayPause = async () => {
    if (!audioUri) {
      await loadAudio();
      return;
    }

    try {
      if (status.playing) {
        player.pause();
      } else {
        player.play();
      }
      lightImpact();
    } catch (error) {
      console.error("[AudioPlayer] Play/pause error:", error);
    }
  };

  /**
   * Handle seek via progress bar tap
   * Uses player.seekTo(seconds) per Expo Audio docs
   */
  const handleSeek = async (event: { nativeEvent: { locationX: number } }) => {
    if (!status.duration || !progressBarWidth) return;

    const x = event.nativeEvent.locationX;
    const percentage = Math.max(0, Math.min(1, x / progressBarWidth));
    const seekPositionSeconds = percentage * status.duration;

    try {
      await player.seekTo(seekPositionSeconds);
      lightImpact();
    } catch (error) {
      console.error("[AudioPlayer] Seek error:", error);
    }
  };

  /**
   * Handle seek to specific timestamp (from transcript)
   */
  const handleSeekToTimestamp = async (ms: number) => {
    if (!audioUri) return;
    try {
      await player.seekTo(ms / 1000);
      if (!status.playing) {
        player.play();
      }
      lightImpact();
    } catch (error) {
      console.error("[AudioPlayer] Seek error:", error);
    }
  };

  /**
   * Format time for display
   */
  const formatTime = (seconds: number) => {
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate progress percentage
  const progress = status.duration > 0 ? (status.currentTime / status.duration) * 100 : 0;

  /**
   * Handle meeting deletion
   */
  const handleDelete = async () => {
    if (!id) return;

    const performDelete = async () => {
      try {
        await deleteMeeting(id);
        router.replace("/(tabs)/meetings");
      } catch (err) {
        console.error("[MeetingDetail] Delete error:", err);
      }
    };

    if (Platform.OS === "web") {
      if (confirm("Delete this meeting? This action cannot be undone.")) {
        performDelete();
      }
    } else {
      Alert.alert(
        "Delete Meeting",
        "Are you sure? This will permanently delete the meeting and all associated data.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: performDelete },
        ]
      );
    }
  };

  /**
   * Handle retry processing
   */
  const handleRetry = async () => {
    if (!id) return;
    try {
      await retryProcessing(id);
      await refetch();
    } catch (err) {
      console.error("[MeetingDetail] Retry error:", err);
    }
  };

  /**
   * Handle share - opens share modal for creating shareable links
   */
  const handleShare = useCallback(() => {
    lightImpact();
    setShowShareModal(true);
  }, []);

  /**
   * Create a new share link for the meeting
   */
  const handleCreateShare = useCallback(async (password?: string): Promise<MeetingShareLink> => {
    if (!id) throw new Error('No meeting ID');
    const shareLink = await createMeetingShare({
      meetingId: id,
      password,
    });
    await refetchShares();
    return shareLink;
  }, [id, createMeetingShare, refetchShares]);

  /**
   * Toggle share link active status
   */
  const handleToggleShare = useCallback(async (shareId: string, isActive: boolean) => {
    await toggleMeetingShare({ shareId, isActive });
    await refetchShares();
  }, [toggleMeetingShare, refetchShares]);

  /**
   * Delete a share link
   */
  const handleDeleteShare = useCallback(async (shareId: string) => {
    await deleteMeetingShare(shareId);
    await refetchShares();
  }, [deleteMeetingShare, refetchShares]);

  /**
   * Handle meeting type selection
   */
  const handleSelectType = async (typeId: string | null) => {
    if (!id) return;
    try {
      await updateMeeting({
        meetingId: id,
        updates: { meeting_type_id: typeId },
      });
      await refetch();
      setShowTypeSelector(false);
      successNotification();
    } catch (err) {
      console.error("[MeetingDetail] Update type error:", err);
      Alert.alert("Error", "Could not update meeting type.");
    }
  };

  /**
   * Navigate to settings to manage meeting types
   */
  const handleManageTypes = () => {
    lightImpact();
    setShowTypeSelector(false);
    router.push("/(tabs)/settings");
  };

  /**
   * Handle contact selection
   */
  const handleSelectContact = async (contactId: string | null) => {
    if (!id) return;
    try {
      await updateMeeting({
        meetingId: id,
        updates: { contact_id: contactId },
      });
      await refetch();
      setShowContactSelector(false);
      successNotification();
    } catch (err) {
      console.error("[MeetingDetail] Update contact error:", err);
      Alert.alert("Error", "Could not update contact.");
    }
  };

  /**
   * Navigate to add contact screen with meeting ID
   * This allows the new contact to be auto-assigned to this meeting
   */
  const handleAddContact = () => {
    lightImpact();
    setShowContactSelector(false);
    // Pass meetingId so the new contact gets auto-assigned to this meeting
    router.push(`/edit-contact?meetingId=${id}`);
  };

  /**
   * Handle saving meeting name
   */
  const handleSaveName = async (newTitle: string) => {
    if (!id) return;
    try {
      await updateMeeting({
        meetingId: id,
        updates: { title: newTitle },
      });
      await refetch();
      successNotification();
    } catch (err) {
      console.error("[MeetingDetail] Update title error:", err);
      Alert.alert("Error", "Could not update meeting name.");
    }
  };

  /**
   * Handle saving billing information
   */
  const handleSaveBilling = async (data: {
    isBillable: boolean;
    billableHours: number | null;
    billableAmount: number | null;
    isManualAmount: boolean;
  }) => {
    if (!id) return;
    try {
      await updateMeetingBilling({
        meetingId: id,
        isBillable: data.isBillable,
        billableHours: data.billableHours,
        billableAmount: data.billableAmount,
        isManualAmount: data.isManualAmount,
      });
      await refetch();
      setShowBillableEditor(false);
      successNotification();
    } catch (err) {
      console.error("[MeetingDetail] Update billing error:", err);
      Alert.alert("Error", "Could not update billing information.");
    }
  };

  // Loading state
  if (isLoading || !meeting) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accentLight} />
        </View>
      </SafeAreaView>
    );
  }

  // Content locked state - show paywall instead of details
  if (isContentLocked) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <ChevronLeft size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {meeting.title}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Locked Content View */}
        <View style={styles.lockedContainer}>
          <View style={styles.lockedIconContainer}>
            <Lock size={48} color={Colors.warning} />
          </View>
          <Text style={styles.lockedTitle}>Meeting Locked</Text>
          <Text style={styles.lockedDescription}>
            Your free trial has ended. Subscribe to access your meeting transcripts, summaries, and audio recordings.
          </Text>
          
          {/* Basic info still visible */}
          <View style={styles.lockedInfoCard}>
            <View style={styles.lockedInfoRow}>
              <Text style={styles.lockedInfoLabel}>Date</Text>
              <Text style={styles.lockedInfoValue}>
                {new Date(meeting.created_at).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.lockedInfoRow}>
              <Text style={styles.lockedInfoLabel}>Duration</Text>
              <Text style={styles.lockedInfoValue}>
                {formatDuration(meeting.duration_seconds)}
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.lockedSubscribeButton}
            onPress={() => router.push("/subscription")}
          >
            <Text style={styles.lockedSubscribeButtonText}>Subscribe to Unlock</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const shouldShowAudioBar = !!(meeting.mp3_audio_path || meeting.raw_audio_path) && meeting.status === "ready";
  const statusInfo = getStatusInfo(meeting.status);

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
            {title}
          </Text>
        </View>
        {/* Placeholder to balance header layout */}
        <View style={styles.headerPlaceholder} />
      </View>

      {/* Scrollable Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Speaker Detection Banner - shown when streaming transcript exists but batch processing is running */}
        {meeting.used_streaming_transcription && 
         meeting.status !== 'ready' && 
         meeting.status !== 'failed' && (
          <View style={styles.speakerDetectionBanner}>
            <ActivityIndicator size="small" color={Colors.accentLight} />
            <View style={styles.speakerDetectionTextContainer}>
              <Text style={styles.speakerDetectionTitle}>Speaker detection in progress...</Text>
              <Text style={styles.speakerDetectionSubtitle}>
                Your transcript is ready. Speaker labels will update automatically.
              </Text>
            </View>
          </View>
        )}

        {/* Status Banner (for non-streaming or failed) */}
        {meeting.status !== 'ready' && 
         !(meeting.used_streaming_transcription && meeting.status !== 'failed') && (
          <View style={[styles.statusBanner, { backgroundColor: `${statusInfo.color}20` }]}>
            <Text style={[styles.statusBannerText, { color: statusInfo.color }]}>
              {statusInfo.label}
            </Text>
            {meeting.status === 'failed' && (
              <Pressable style={styles.retryBannerButton} onPress={handleRetry} disabled={isRetrying}>
                <RefreshCw size={16} color={Colors.accentLight} />
                <Text style={styles.retryBannerText}>Retry</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Meeting Details */}
        <View style={styles.detailsCard}>
          {/* HEADER SECTION - Prominent */}
          <View style={styles.detailsCardHeader}>
            <View style={styles.durationDisplay}>
              <Clock size={24} color={getDurationColor(meeting.duration_seconds)} />
              <Text style={[styles.durationLarge, { color: getDurationColor(meeting.duration_seconds) }]}>
                {formatDuration(meeting.duration_seconds)}
              </Text>
            </View>
            <View style={styles.dateTimeDisplay}>
              <Text style={styles.dateCompact}>
                {formatCompactDateTime(new Date(meeting.created_at))}
              </Text>
              {meeting.recorded_at && (
                <Text style={styles.recordingTimeline}>
                  {formatRecordingTimeline(
                    new Date(meeting.recorded_at), 
                    meeting.duration_seconds
                  )}
                </Text>
              )}
            </View>
          </View>

          {/* DIVIDER */}
          <View style={styles.cardDivider} />

          {/* BODY SECTION - Secondary Details */}
          <View style={styles.cardBody}>
            {/* Meeting Type */}
            <Pressable
              style={styles.typeRow}
              onPress={() => {
                lightImpact();
                setShowTypeSelector(true);
              }}
            >
              <View style={styles.typeRowLeft}>
                <Tag size={18} color={Colors.textMuted} />
                <Text style={styles.detailLabel}>Meeting Type</Text>
              </View>
              <View style={styles.typeRowRight}>
                {meeting.meeting_type ? (
                  <View style={[styles.typeBadge, { backgroundColor: meeting.meeting_type.color + "20" }]}>
                    <View style={[styles.typeBadgeDot, { backgroundColor: meeting.meeting_type.color }]} />
                    <Text style={[styles.typeBadgeText, { color: meeting.meeting_type.color }]}>
                      {meeting.meeting_type.name}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.typeNotSet}>Not set</Text>
                )}
                <ChevronRight size={18} color={Colors.textMuted} />
              </View>
            </Pressable>

            {/* Contact */}
            <Pressable
              style={styles.typeRow}
              onPress={() => {
                lightImpact();
                setShowContactSelector(true);
              }}
            >
              <View style={styles.typeRowLeft}>
                <User size={18} color={Colors.textMuted} />
                <Text style={styles.detailLabel}>Contact</Text>
              </View>
              <View style={styles.typeRowRight}>
                {meeting.contact ? (
                  <View style={styles.contactBadge}>
                    <View style={[styles.contactBadgeAvatar, { backgroundColor: meeting.contact.category?.color || Colors.accentLight }]}>
                      <Text style={styles.contactBadgeInitials}>
                        {getContactInitials(meeting.contact)}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.contactBadgeName}>
                        {formatContactName(meeting.contact)}
                      </Text>
                      {meeting.contact.category && (
                        <Text style={[styles.contactBadgeCategory, { color: meeting.contact.category.color }]}>
                          {meeting.contact.category.name}
                        </Text>
                      )}
                    </View>
                  </View>
                ) : (
                  <Text style={styles.typeNotSet}>Not set</Text>
                )}
                <ChevronRight size={18} color={Colors.textMuted} />
              </View>
            </Pressable>

            {/* Billable */}
            <View style={styles.typeRow}>
              <View style={styles.typeRowLeft}>
                <DollarSign size={18} color={Colors.textMuted} />
                <Text style={styles.detailLabel}>Billable</Text>
              </View>
              <Switch
                value={meeting.is_billable}
                onValueChange={(value) => {
                  lightImpact();
                  if (value) {
                    // Open modal when toggling ON
                    setShowBillableEditor(true);
                  } else {
                    // Directly disable billing when toggling OFF
                    handleSaveBilling({
                      isBillable: false,
                      billableHours: null,
                      billableAmount: null,
                      isManualAmount: false,
                    });
                  }
                }}
                trackColor={{ false: Colors.border, true: Colors.success + '80' }}
                thumbColor={meeting.is_billable ? Colors.success : Colors.textMuted}
              />
            </View>
          </View>
        </View>

        {/* Billing Card - Show when billable is enabled */}
        {meeting.is_billable && (
          <View style={styles.billingCard}>
            <View style={styles.billingCardHeader}>
              <Text style={styles.billingCardTitle}>Billing</Text>
              <Pressable onPress={() => setShowBillableEditor(true)}>
                <Text style={styles.billingEditLink}>Edit</Text>
              </Pressable>
            </View>
            <View style={styles.billingCardContent}>
              {meeting.billable_amount && meeting.billable_amount > 0 ? (
                <>
                  <Text style={styles.billingAmountValue}>
                    {formatCurrency(meeting.billable_amount, profile?.currency_symbol || '$')}
                  </Text>
                  <Text style={styles.billingTimeValue}>
                    {formatBillableHours(meeting.billable_hours)}
                  </Text>
                  {meeting.billable_hours && profile?.hourly_rate && (
                    <Text style={styles.billingCalculation}>
                      {formatBillableHours(meeting.billable_hours)} × {formatCurrency(profile.hourly_rate, profile.currency_symbol || '$')}/hr
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.billingTimeValue}>
                    {meeting.billable_hours ? formatBillableHours(meeting.billable_hours) : 'No time set'}
                  </Text>
                  <Text style={styles.billingNoRate}>
                    Set hourly rate to calculate amount
                  </Text>
                </>
              )}
            </View>
          </View>
        )}

        {/* Summary Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Summary</Text>
          {transcript?.summary && 
           transcript.summary !== 'Summary not available.' && 
           transcript.summary !== 'Summary generation failed. Please retry processing.' &&
           transcript.summary !== 'Summary generation encountered an error.' ? (
            <Text style={styles.summaryText}>{transcript.summary}</Text>
          ) : (
            <Text style={styles.noDataText}>
              {meeting.status === "transcribing" || meeting.status === "converting"
                ? "Summary is being generated..."
                : meeting.status === "failed"
                ? "Processing failed. Tap retry above."
                : "No summary available"}
            </Text>
          )}
        </View>

        {/* Transcript Preview */}
        {(segments && segments.length > 0) || transcript?.full_text ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>Transcript</Text>
                {/* Feedback button - show when meeting has segments */}
                {segments && segments.length > 0 && (
                  <Pressable
                    style={styles.feedbackButton}
                    onPress={() => setShowSpeakerFeedback(true)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Flag size={14} color={Colors.textMuted} />
                  </Pressable>
                )}
              </View>
              <Pressable onPress={() => setShowTranscript(true)}>
                <Text style={styles.viewAllLink}>
                  {segments && segments.length > 0 
                    ? `View All (${segments.length})` 
                    : 'View Full'}
                </Text>
              </Pressable>
            </View>
            {segments && segments.length > 0 ? (
              segments.slice(0, 2).map((segment) => (
                <View key={segment.id} style={styles.previewSegmentCard}>
                  <View style={[styles.previewAccentBar, { backgroundColor: getSpeakerColors(segment.speaker).accent }]} />
                  <View style={styles.previewSegmentContent}>
                    <Text style={[styles.previewSpeakerLabel, { color: getSpeakerColors(segment.speaker).text }]}>
                      {formatSpeakerLabel(segment.speaker)}
                    </Text>
                    <Text style={styles.previewSegmentText} numberOfLines={2}>
                      {segment.text}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.transcriptPreview} numberOfLines={4}>
                {transcript?.full_text}
              </Text>
            )}
          </View>
        ) : null}

        {/* Error Message */}
        {meeting.error_message && (
          <View style={styles.errorCard}>
            <AlertTriangle size={20} color={Colors.error} />
            <Text style={styles.errorText}>{meeting.error_message}</Text>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Fixed Floating Quick Actions Button */}
      <Pressable 
        style={[styles.floatingActionButton, shouldShowAudioBar && styles.floatingActionButtonWithAudio]}
        onPress={() => {
          lightImpact();
          setShowQuickActions(true);
        }}
      >
        <MoreVertical size={24} color="#ffffff" />
      </Pressable>

      {/* Audio Player Bar */}
      {shouldShowAudioBar && (
        <View style={styles.audioBar}>
          {audioLoadError ? (
            <View style={styles.audioErrorContainer}>
              <AlertTriangle size={16} color={Colors.warning} />
              <Text style={styles.audioErrorText} numberOfLines={2}>
                {audioErrorMessage || "Audio unavailable"}
              </Text>
            </View>
          ) : isAudioLoading ? (
            <View style={styles.audioErrorContainer}>
              <ActivityIndicator size="small" color={Colors.accentLight} />
              <Text style={styles.audioErrorText}>Loading audio...</Text>
            </View>
          ) : (
            <>
              <Pressable 
                style={styles.playButton} 
                onPress={handlePlayPause} 
                disabled={isAudioLoading || status.isBuffering}
              >
                {status.isBuffering ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : status.playing ? (
                  <Pause size={20} color={Colors.text} fill={Colors.text} />
                ) : (
                  <Play size={20} color={Colors.text} fill={Colors.text} />
                )}
              </Pressable>

              <Pressable style={styles.audioProgressContainer} onPress={handleSeek}>
                <View
                  style={styles.audioProgress}
                  onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
                >
                  <View style={[styles.audioProgressBar, { width: `${progress}%` }]} />
                  <View style={[styles.audioProgressThumb, { left: `${progress}%` }]} />
                </View>
              </Pressable>

              <Text style={styles.audioTime}>
                {formatTime(status.currentTime || 0)} / {formatTime(status.duration || meeting.duration_seconds)}
              </Text>

              {segments && segments.length > 0 && (
                <Pressable style={styles.transcriptButton} onPress={() => setShowTranscript(true)}>
                  <Text style={styles.transcriptButtonText}>Transcript</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      )}

      {/* Transcript Modal */}
      <TranscriptBottomSheet
        visible={showTranscript}
        onClose={() => setShowTranscript(false)}
        segments={segments}
        onSeek={handleSeekToTimestamp}
      />

      {/* Type Selector Modal */}
      <TypeSelectorModal
        visible={showTypeSelector}
        onClose={() => setShowTypeSelector(false)}
        types={meetingTypes}
        currentTypeId={meeting.meeting_type_id}
        onSelect={handleSelectType}
        onManageTypes={handleManageTypes}
        isUpdating={isUpdating}
      />

      {/* Contact Selector Modal */}
      <ContactSelectorModal
        visible={showContactSelector}
        onClose={() => setShowContactSelector(false)}
        contacts={contacts}
        currentContactId={meeting.contact_id}
        onSelect={handleSelectContact}
        onAddContact={handleAddContact}
        isUpdating={isUpdating}
      />

      {/* Billable Editor Modal */}
      <BillableEditorModal
        visible={showBillableEditor}
        onClose={() => setShowBillableEditor(false)}
        meeting={{
          id: meeting.id,
          duration_seconds: meeting.duration_seconds,
          is_billable: meeting.is_billable,
          billable_hours: meeting.billable_hours,
          billable_amount: meeting.billable_amount,
          billable_amount_manual: meeting.billable_amount_manual,
        }}
        hourlyRate={profile?.hourly_rate ?? null}
        currencySymbol={profile?.currency_symbol || '$'}
        onSave={handleSaveBilling}
        isSaving={isUpdatingBilling}
        onNavigateToSettings={() => router.push('/(tabs)/settings')}
      />

      {/* Speaker Feedback Modal */}
      <SpeakerFeedbackModal
        visible={showSpeakerFeedback}
        onClose={() => setShowSpeakerFeedback(false)}
        meeting={{
          id: meeting.id,
          expected_speakers: meeting.expected_speakers,
          detected_speakers: meeting.detected_speakers ?? null,
          speaker_mismatch: meeting.speaker_mismatch,
        }}
        onSubmit={async (feedbackType, notes) => {
          await submitSpeakerFeedback({
            meetingId: meeting.id,
            feedbackType: feedbackType as 'wrong_speaker_count' | 'speakers_merged' | 'speakers_split' | 'wrong_attribution' | 'other',
            notes,
          });
        }}
        isSubmitting={isSubmittingFeedback}
      />

      {/* Quick Actions Menu Modal */}
      <QuickActionsMenu
        visible={showQuickActions}
        onClose={() => setShowQuickActions(false)}
        onShare={handleShare}
        onEditName={() => setShowEditName(true)}
        onSearchTranscript={() => {
          setShowQuickActions(false);
          setShowTranscript(true);
        }}
        onDelete={handleDelete}
      />

      {/* Edit Name Modal */}
      <EditNameModal
        visible={showEditName}
        currentTitle={meeting?.title || ""}
        onClose={() => setShowEditName(false)}
        onSave={handleSaveName}
        isSaving={isUpdating}
      />

      {/* Share Meeting Modal */}
      <ShareMeetingModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        meetingId={id || ''}
        meetingTitle={meeting?.title || ''}
        shares={shares}
        isLoadingShares={isLoadingShares}
        onCreateShare={handleCreateShare}
        onToggleShare={handleToggleShare}
        onDeleteShare={handleDeleteShare}
        isCreating={isCreatingShare}
        isToggling={isTogglingShare}
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
  // Locked content styles
  lockedContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  lockedIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: `${Colors.warning}20`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  lockedTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 12,
  },
  lockedDescription: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  lockedInfoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  lockedInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  lockedInfoLabel: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  lockedInfoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
  },
  lockedSubscribeButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: "100%",
  },
  lockedSubscribeButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#000",
    textAlign: "center",
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
    gap: 8,
  },
  headerActionButton: {
    padding: 8,
  },
  headerPlaceholder: {
    width: 32, // Same width as backButton to balance header
  },
  content: {
    flex: 1,
  },
  speakerDetectionBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.accentLight + "15",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accentLight + "30",
  },
  speakerDetectionTextContainer: {
    flex: 1,
  },
  speakerDetectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.accentLight,
    marginBottom: 2,
  },
  speakerDetectionSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  statusBannerText: {
    fontSize: 14,
    fontWeight: "600",
  },
  retryBannerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
    borderRadius: 16,
  },
  retryBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.accentLight,
  },
  detailsCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  // New card header section styles (for details card)
  detailsCardHeader: {
    paddingBottom: 16,
    alignItems: 'center',
    gap: 8,
  },
  durationDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
  },
  durationLarge: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  dateTimeDisplay: {
    alignItems: 'center',
    gap: 4,
  },
  dateCompact: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  recordingTimeline: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  cardBody: {
    gap: 0,
    paddingTop: 0,
  },
  floatingActionButton: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accentLight,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 1000,
  },
  floatingActionButtonWithAudio: {
    bottom: 90, // Position above audio bar when it's visible
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailLabel: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  detailText: {
    fontSize: 14,
    color: Colors.text,
  },
  streamingBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10B981",
    backgroundColor: "#10B981" + "20",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 12,
  },
  feedbackButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  viewAllLink: {
    fontSize: 14,
    color: Colors.accentLight,
    fontWeight: "500",
  },
  summaryText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  transcriptPreview: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  previewSegmentCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  previewAccentBar: {
    width: 4,
    // backgroundColor is set dynamically based on speaker
  },
  previewSegmentContent: {
    flex: 1,
    padding: 12,
  },
  previewSpeakerLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    // color is set dynamically based on speaker
  },
  previewSegmentText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  noDataText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: "center",
    paddingVertical: 16,
  },
  errorCard: {
    backgroundColor: `${Colors.error}15`,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.error,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: Colors.error,
    lineHeight: 20,
  },
  audioBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 12,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accentLight,
    justifyContent: "center",
    alignItems: "center",
  },
  audioProgressContainer: {
    flex: 1,
    height: 32,
    justifyContent: "center",
  },
  audioProgress: {
    height: 4,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 2,
    position: "relative",
  },
  audioProgressBar: {
    height: "100%",
    backgroundColor: Colors.accentLight,
    borderRadius: 2,
  },
  audioProgressThumb: {
    position: "absolute",
    top: -4,
    marginLeft: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accentLight,
  },
  audioTime: {
    fontSize: 11,
    color: Colors.textMuted,
    minWidth: 70,
  },
  transcriptButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 6,
  },
  transcriptButtonText: {
    fontSize: 12,
    color: Colors.accentLight,
    fontWeight: "500",
  },
  audioErrorContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  audioErrorText: {
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
    flexWrap: "wrap",
  },
  // Bottom Sheet Styles
  bottomSheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  bottomSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  bottomSheetContainer: {
    backgroundColor: '#1a1f2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingBottom: Platform.OS === "ios" ? 20 : 0,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#4b5563',
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  bottomSheetTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: '#ffffff',
  },
  bottomSheetClose: {
    padding: 4,
  },
  bottomSheetContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  transcriptSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  transcriptSearchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    padding: 0,
  },
  transcriptSegmentCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmentAccentBar: {
    width: 5,
    alignSelf: 'stretch',
    // backgroundColor is set dynamically based on speaker
  },
  segmentContent: {
    flex: 1,
    padding: 16,
    paddingLeft: 20,
  },
  transcriptSpeakerLabel: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    // color is set dynamically based on speaker
  },
  transcriptSegmentText: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
    marginBottom: 8,
  },
  transcriptTimestamp: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  // Meeting Type styles
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  typeRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  typeRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  typeBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  typeNotSet: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  // Contact Badge styles
  contactBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  contactBadgeAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  contactBadgeInitials: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
  },
  contactBadgeName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
  },
  contactBadgeCategory: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  // Billing Card styles (separate card below details)
  billingCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  billingCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  billingCardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.text,
  },
  billingEditLink: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.accentLight,
  },
  billingCardContent: {
    padding: 20,
    alignItems: "center",
  },
  billingAmountValue: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.success,
  },
  billingTimeValue: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  billingCalculation: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 8,
  },
  billingNoRate: {
    fontSize: 13,
    color: Colors.warning,
    marginTop: 8,
    textAlign: "center",
  },
});

// Billable Editor Modal Styles
const billableStyles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
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
    maxHeight: "70%",
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
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: '#ffffff',
  },
  headerSubtext: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
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
    paddingTop: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 24,
  },
  // Recorded Duration - Prominent Display
  recordedSection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recordedLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  recordedValue: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.text,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  fieldLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  resetLink: {
    fontSize: 13,
    color: Colors.accentLight,
    fontWeight: "500",
  },
  fieldInput: {
    backgroundColor: '#252b3d',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: "600",
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#374151',
  },
  timeInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  timeInputContainer: {
    flex: 1,
    alignItems: "center",
  },
  timeInput: {
    backgroundColor: '#252b3d',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: "700",
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#374151',
    textAlign: "center",
    minWidth: 80,
  },
  timeLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
  },
  timeSeparator: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.textMuted,
    marginBottom: 24,
  },
  amountInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: '#252b3d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    paddingLeft: 16,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.textMuted,
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: 16,
    fontSize: 18,
    fontWeight: "600",
    color: '#ffffff',
  },
  // Rate Option styles
  rateOptionTabs: {
    flexDirection: "row",
    backgroundColor: '#252b3d',
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
  },
  rateOptionTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  rateOptionTabActive: {
    backgroundColor: Colors.accentLight,
  },
  rateOptionTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textMuted,
  },
  rateOptionTabTextActive: {
    color: '#ffffff',
  },
  defaultRateDisplay: {
    backgroundColor: '#252b3d',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: '#374151',
  },
  defaultRateValue: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.success,
  },
  noDefaultRate: {
    fontSize: 14,
    color: Colors.warning,
    textAlign: "center",
  },
  setDefaultRateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 4,
  },
  setDefaultRateText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.accentLight,
  },
  // Rate Input styles
  rateInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: '#252b3d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 16,
  },
  rateInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: "600",
    color: '#ffffff',
    textAlign: "center",
  },
  rateSuffix: {
    fontSize: 16,
    fontWeight: "500",
    color: Colors.textMuted,
    marginLeft: 4,
  },
  fieldHint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
  },
  manualHint: {
    fontSize: 12,
    color: Colors.warning,
    marginTop: 6,
  },
  warningHint: {
    fontSize: 12,
    color: Colors.warning,
    marginTop: 8,
  },
  previewCard: {
    backgroundColor: Colors.success + '15',
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.success,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  previewAmount: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.success,
    marginBottom: 4,
  },
  previewHours: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  previewCalculation: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 8,
  },
  warningCard: {
    backgroundColor: Colors.warning + '15',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  warningText: {
    fontSize: 14,
    color: Colors.warning,
    textAlign: "center",
    lineHeight: 20,
  },
  footerInScroll: {
    marginTop: 24,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#374151',
    padding: 20,
    backgroundColor: '#1a1f2e',
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

// Type Selector Modal Styles
const typeSelectorStyles = StyleSheet.create({
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
    flexDirection: 'column', // Enable flex layout
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
    flexGrow: 0, // Let content determine size, but allow scrolling
    flexShrink: 1, // Allow shrinking if needed
  },
  scrollContentContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  typeOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#252b3d',
    borderRadius: 12,
    marginBottom: 10,
  },
  typeOptionSelected: {
    borderWidth: 2,
    borderColor: Colors.accentLight,
  },
  typeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  typeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  typeName: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: "500",
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#374151',
    backgroundColor: '#1a1f2e',
  },
  manageTypesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 6,
  },
  manageTypesText: {
    fontSize: 14,
    color: Colors.accentLight,
    fontWeight: "500",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
});

// Contact Selector Modal Styles
const contactSelectorStyles = StyleSheet.create({
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
    maxHeight: "75%",
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: '#252b3d',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#374151',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#ffffff',
    padding: 0,
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
  contactOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#252b3d',
    borderRadius: 12,
    marginBottom: 10,
  },
  contactOptionSelected: {
    borderWidth: 2,
    borderColor: Colors.accentLight,
  },
  contactLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  contactInitials: {
    fontSize: 14,
    fontWeight: "700",
    color: '#ffffff',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: "500",
  },
  contactCategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  contactCategoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  contactCategory: {
    fontSize: 12,
    color: '#9ca3af',
  },
  contactCompany: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  noResults: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: "center",
    paddingVertical: 20,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#374151',
    backgroundColor: '#1a1f2e',
  },
  addContactButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 6,
  },
  addContactText: {
    fontSize: 14,
    color: Colors.accentLight,
    fontWeight: "500",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
});

// Quick Actions Menu Styles
const quickActionsStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    backgroundColor: '#1a1f2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#4b5563',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  actionsList: {
    gap: 4,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#252b3d',
    borderRadius: 12,
    gap: 16,
    marginBottom: 8,
  },
  actionIcon: {
    width: 24,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
    flex: 1,
  },
  actionTextDelete: {
    color: Colors.error,
  },
});

// Edit Name Modal Styles
const editNameStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  container: {
    backgroundColor: '#1a1f2e',
    borderRadius: 20,
    width: '85%',
    maxWidth: 400,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#252b3d',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#252b3d',
  },
  saveButton: {
    backgroundColor: Colors.accentLight,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

// Share Meeting Modal Styles
const shareModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  container: {
    backgroundColor: '#1a1f2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    minHeight: 500,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#4b5563',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2d3548',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flexGrow: 1,
    flexShrink: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 16,
    lineHeight: 18,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#252b3d',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  passwordLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  passwordLabel: {
    fontSize: 15,
    color: '#ffffff',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252b3d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 16,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#ffffff',
  },
  passwordToggle: {
    padding: 14,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.accentLight,
    borderRadius: 12,
    paddingVertical: 16,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.success + '20',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  successText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.success,
  },
  shareCard: {
    backgroundColor: '#252b3d',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  shareCardInactive: {
    opacity: 0.6,
  },
  shareCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  shareInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareDate: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  shareStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shareViews: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  shareActions: {
    flexDirection: 'row',
    gap: 8,
  },
  shareActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#1a1f2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareActionBtnActive: {
    backgroundColor: Colors.success + '20',
  },
  inactiveLabel: {
    fontSize: 12,
    color: Colors.warning,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
});
