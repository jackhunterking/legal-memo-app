import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { X, User, Check, UserCircle } from 'lucide-react-native';
import { lightImpact, successNotification, errorNotification } from '@/lib/haptics';
import Colors from '@/constants/colors';

interface SpeakerInfo {
  label: string;           // Original label (e.g., "Speaker A")
  customName: string;      // User-entered custom name
  color: string;           // Accent color for the speaker
}

interface SpeakerNamesModalProps {
  visible: boolean;
  onClose: () => void;
  speakers: string[];                              // Unique speaker labels from transcript
  currentNames: Record<string, string> | null;    // Current speaker_names mapping
  onSave: (speakerNames: Record<string, string>) => Promise<void>;
  isSaving: boolean;
}

// Get color for each speaker based on their label
const getSpeakerColor = (speaker: string): string => {
  const label = speaker.toUpperCase();
  if (label.endsWith('A') || label.includes('SPEAKER A')) return '#3b82f6'; // Blue
  if (label.endsWith('B') || label.includes('SPEAKER B')) return '#ef4444'; // Red
  if (label.endsWith('C') || label.includes('SPEAKER C')) return '#8b5cf6'; // Purple
  if (label.endsWith('D') || label.includes('SPEAKER D')) return '#10b981'; // Green
  return '#f59e0b'; // Orange for others
};

const SpeakerNamesModal: React.FC<SpeakerNamesModalProps> = ({
  visible,
  onClose,
  speakers,
  currentNames,
  onSave,
  isSaving,
}) => {
  const [speakerInfos, setSpeakerInfos] = useState<SpeakerInfo[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize speaker infos when modal opens
  useEffect(() => {
    if (visible && speakers.length > 0) {
      const infos: SpeakerInfo[] = speakers.map((speaker) => ({
        label: speaker,
        customName: currentNames?.[speaker] || '',
        color: getSpeakerColor(speaker),
      }));
      setSpeakerInfos(infos);
      setHasChanges(false);
    }
  }, [visible, speakers, currentNames]);

  // Update a speaker's custom name
  const updateSpeakerName = (index: number, name: string) => {
    const updated = [...speakerInfos];
    updated[index].customName = name;
    setSpeakerInfos(updated);
    setHasChanges(true);
  };

  // Set a speaker as "Me"
  const setAsMe = (index: number) => {
    lightImpact();
    const updated = [...speakerInfos];
    updated[index].customName = 'Me';
    setSpeakerInfos(updated);
    setHasChanges(true);
  };

  // Handle save
  const handleSave = async () => {
    lightImpact();
    
    // Build the speaker names mapping
    const speakerNames: Record<string, string> = {};
    for (const info of speakerInfos) {
      if (info.customName.trim()) {
        speakerNames[info.label] = info.customName.trim();
      }
    }
    
    try {
      await onSave(speakerNames);
      successNotification();
      onClose();
    } catch (error) {
      errorNotification();
      console.error('[SpeakerNamesModal] Error saving:', error);
    }
  };

  // Handle close
  const handleClose = () => {
    lightImpact();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
        
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <UserCircle size={24} color={Colors.accentLight} />
              <Text style={styles.title}>Edit Speaker Names</Text>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={24} color={Colors.textMuted} />
            </Pressable>
          </View>

          {/* Description */}
          <Text style={styles.description}>
            Assign names to speakers in your transcript. Use "Me" to identify yourself.
          </Text>

          {/* Speaker List */}
          <ScrollView 
            style={styles.speakerList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {speakerInfos.map((speaker, index) => (
              <View key={speaker.label} style={styles.speakerRow}>
                {/* Speaker Label with Color */}
                <View style={styles.speakerLabelContainer}>
                  <View style={[styles.speakerDot, { backgroundColor: speaker.color }]} />
                  <Text style={styles.speakerLabel}>{speaker.label}</Text>
                </View>

                {/* Name Input */}
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.nameInput}
                    placeholder="Enter name..."
                    placeholderTextColor={Colors.textMuted}
                    value={speaker.customName}
                    onChangeText={(text) => updateSpeakerName(index, text)}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  
                  {/* "Me" Button */}
                  <Pressable
                    style={[
                      styles.meButton,
                      speaker.customName === 'Me' && styles.meButtonActive,
                    ]}
                    onPress={() => setAsMe(index)}
                  >
                    <User 
                      size={16} 
                      color={speaker.customName === 'Me' ? Colors.background : Colors.textSecondary} 
                    />
                    <Text style={[
                      styles.meButtonText,
                      speaker.customName === 'Me' && styles.meButtonTextActive,
                    ]}>
                      Me
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <Pressable
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={isSaving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            
            <Pressable
              style={[
                styles.saveButton,
                (!hasChanges || isSaving) && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={!hasChanges || isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={Colors.text} />
              ) : (
                <>
                  <Check size={18} color={Colors.text} />
                  <Text style={styles.saveButtonText}>Save Names</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  closeButton: {
    padding: 4,
  },
  description: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  speakerList: {
    flexGrow: 0,
    marginBottom: 20,
  },
  speakerRow: {
    marginBottom: 16,
  },
  speakerLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  speakerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  speakerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nameInput: {
    flex: 1,
    height: 48,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  meButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  meButtonActive: {
    backgroundColor: Colors.accentLight,
    borderColor: Colors.accentLight,
  },
  meButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  meButtonTextActive: {
    color: Colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: Colors.accentLight,
    borderRadius: 12,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
});

export default SpeakerNamesModal;

