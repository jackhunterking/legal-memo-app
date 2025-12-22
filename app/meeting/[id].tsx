import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
  Share,
  Switch,
} from "react-native";
import DateTimePicker from '@react-native-community/datetimepicker';
import { Audio, AVPlaybackStatus } from "expo-av";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronLeft,
  Play,
  Pause,
  Edit3,
  Trash2,
  AlertTriangle,
  Search,
  X,
  Clock,
  DollarSign,
  Plus,
  CheckCircle2,
  Circle,
  RefreshCw,
  Loader,
  Share2,
  Sparkles,
  ChevronDown,
  Calendar,
  Bell,
  Flag,
  ChevronRight,
  Edit2,
  User,
  FileText,
  Check,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetingDetails, useMeetings } from "@/contexts/MeetingContext";
import { useTasks, useMeetingTasks } from "@/contexts/TaskContext";
import { useContacts } from "@/contexts/ContactContext";
import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";
import type { MeetingTask } from "@/types";
import { MEETING_TYPES } from "@/types";

// Unified Action Item type
type UnifiedAction = {
  id: string;
  title: string;
  completed: boolean;
  owner: string | null;
  dueDate: string | null;
  isAIGenerated: boolean;
  rawTask?: any;
};

// Insights Bottom Sheet Component
const InsightsBottomSheet = ({ visible, onClose, aiOutput }: any) => {
  if (!aiOutput) return null;

  const sections = [
    {
      title: "Key Facts",
      items: aiOutput.key_facts_stated || [],
      accessor: "fact",
    },
    {
      title: "Legal Issues",
      items: aiOutput.legal_issues_discussed || [],
      accessor: "issue",
    },
    {
      title: "Decisions Made",
      items: aiOutput.decisions_made || [],
      accessor: "decision",
    },
    {
      title: "Risks & Concerns",
      items: aiOutput.risks_or_concerns_raised || [],
      accessor: "risk",
    },
    {
      title: "Open Questions",
      items: aiOutput.open_questions || [],
      accessor: "question",
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.bottomSheetOverlay}>
        <Pressable style={styles.bottomSheetBackdrop} onPress={onClose} />
        <View style={styles.bottomSheetContainer}>
          <View style={styles.bottomSheetHandle} />
          <View style={styles.bottomSheetHeader}>
            <Text style={styles.bottomSheetTitle}>Meeting Insights</Text>
            <Pressable onPress={onClose} style={styles.bottomSheetClose}>
              <X size={24} color={Colors.text} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.bottomSheetContent}
            showsVerticalScrollIndicator={false}
          >
            {sections.map(
              (section) =>
                section.items.length > 0 && (
                  <View key={section.title} style={styles.insightSection}>
                    <Text style={styles.insightSectionTitle}>
                      {section.title}
                    </Text>
                    {section.items.map((item: any, index: number) => (
                      <View key={index} style={styles.insightItem}>
                        <Text style={styles.insightItemText}>
                          • {item[section.accessor]}
                        </Text>
                      </View>
                    ))}
                  </View>
                )
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// Transcript Bottom Sheet Component
const TranscriptBottomSheet = ({
  visible,
  onClose,
  segments,
  onSeek,
}: any) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSegments = useMemo(() => {
    if (!segments || !searchQuery.trim()) return segments || [];
    const query = searchQuery.toLowerCase();
    return segments.filter(
      (segment: any) =>
        segment.text.toLowerCase().includes(query) ||
        (segment.speaker_name || segment.speaker_label)
          .toLowerCase()
          .includes(query)
    );
  }, [segments, searchQuery]);

  const HighlightedText = ({ text }: { text: string }) => {
    if (!searchQuery.trim()) {
      return <Text style={styles.transcriptSegmentText}>{text}</Text>;
    }

    const parts = text.split(new RegExp(`(${searchQuery})`, "gi"));
    return (
      <Text style={styles.transcriptSegmentText}>
        {parts.map((part, index) =>
          part.toLowerCase() === searchQuery.toLowerCase() ? (
            <Text key={index} style={styles.highlightedText}>
              {part}
            </Text>
          ) : (
            <Text key={index}>{part}</Text>
          )
        )}
      </Text>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.bottomSheetOverlay}>
        <Pressable style={styles.bottomSheetBackdrop} onPress={onClose} />
        <View style={styles.bottomSheetContainer}>
          <View style={styles.bottomSheetHandle} />
          <View style={styles.bottomSheetHeader}>
            <Text style={styles.bottomSheetTitle}>Transcript</Text>
            <Pressable onPress={onClose} style={styles.bottomSheetClose}>
              <X size={24} color={Colors.text} />
            </Pressable>
          </View>

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

          <ScrollView
            style={styles.bottomSheetContent}
            showsVerticalScrollIndicator={false}
          >
            {filteredSegments.length > 0 ? (
              filteredSegments.map((segment: any, index: number) => (
                <Pressable
                  key={segment.id || index}
                  style={styles.transcriptSegment}
                  onPress={() => {
                    if (onSeek) onSeek(segment.start_ms);
                    if (Platform.OS !== "web") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                >
                  <View style={styles.transcriptSegmentHeader}>
                    <Text style={styles.transcriptSpeaker}>
                      {segment.speaker_name || segment.speaker_label}
                    </Text>
                    <Text style={styles.transcriptTimestamp}>
                      {Math.floor(segment.start_ms / 60000)}:
                      {((segment.start_ms % 60000) / 1000)
                        .toFixed(0)
                        .padStart(2, "0")}
                    </Text>
                  </View>
                  <HighlightedText text={segment.text} />
                </Pressable>
              ))
            ) : (
              <Text style={styles.noDataText}>
                {searchQuery.trim() ? "No matches found" : "No transcript available"}
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

type DeadlineOption = 'none' | 'today' | 'tomorrow' | 'next_week' | 'custom';
type ReminderOption = 'none' | 'at_deadline' | '1_hour' | '1_day' | '3_days';
type PriorityOption = 'low' | 'medium' | 'high';

const DEADLINE_OPTIONS: { key: DeadlineOption; label: string }[] = [
  { key: 'none', label: 'No deadline' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'next_week', label: 'Next week' },
];

const REMINDER_OPTIONS: { key: ReminderOption; label: string }[] = [
  { key: 'none', label: 'No reminder' },
  { key: 'at_deadline', label: 'At deadline' },
  { key: '1_hour', label: '1 hour before' },
  { key: '1_day', label: '1 day before' },
  { key: '3_days', label: '3 days before' },
];

const PRIORITY_OPTIONS: { key: PriorityOption; label: string; color: string }[] = [
  { key: 'low', label: 'Low', color: Colors.textMuted },
  { key: 'medium', label: 'Medium', color: Colors.warning },
  { key: 'high', label: 'High', color: Colors.error },
];

const getDeadlineDate = (option: DeadlineOption): Date | null => {
  const now = new Date();
  switch (option) {
    case 'today':
      now.setHours(23, 59, 59, 999);
      return now;
    case 'tomorrow':
      now.setDate(now.getDate() + 1);
      now.setHours(23, 59, 59, 999);
      return now;
    case 'next_week':
      now.setDate(now.getDate() + 7);
      now.setHours(23, 59, 59, 999);
      return now;
    default:
      return null;
  }
};

const getReminderDate = (deadline: Date | null, option: ReminderOption): Date | null => {
  if (!deadline || option === 'none') return null;
  const reminder = new Date(deadline);
  switch (option) {
    case 'at_deadline':
      return reminder;
    case '1_hour':
      reminder.setHours(reminder.getHours() - 1);
      return reminder;
    case '1_day':
      reminder.setDate(reminder.getDate() - 1);
      return reminder;
    case '3_days':
      reminder.setDate(reminder.getDate() - 3);
      return reminder;
    default:
      return null;
  }
};

const EditTaskSheet = ({ visible, onClose, onUpdate, isUpdating, task }: any) => {
  const [taskTitle, setTaskTitle] = useState("");
  const [selectedDeadline, setSelectedDeadline] = useState<DeadlineOption>('none');
  const [customDeadline, setCustomDeadline] = useState<Date | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<ReminderOption>('none');
  const [selectedPriority, setSelectedPriority] = useState<PriorityOption>('medium');
  const [showDeadlineOptions, setShowDeadlineOptions] = useState(false);
  const [showReminderOptions, setShowReminderOptions] = useState(false);
  const [showPriorityOptions, setShowPriorityOptions] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (task && visible) {
      setTaskTitle(task.title);
      setSelectedPriority(task.priority || 'medium');
      
      if (task.deadline) {
        const deadline = new Date(task.deadline);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        
        if (deadline.toDateString() === today.toDateString()) {
          setSelectedDeadline('today');
        } else if (deadline.toDateString() === tomorrow.toDateString()) {
          setSelectedDeadline('tomorrow');
        } else if (deadline.toDateString() === nextWeek.toDateString()) {
          setSelectedDeadline('next_week');
        } else {
          setSelectedDeadline('custom');
          setCustomDeadline(deadline);
        }
      } else {
        setSelectedDeadline('none');
        setCustomDeadline(null);
      }
      
      if (task.reminder_time) {
        setReminderEnabled(true);
        const deadline = task.deadline ? new Date(task.deadline) : null;
        const reminder = new Date(task.reminder_time);
        
        if (deadline) {
          const diffMs = deadline.getTime() - reminder.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          
          if (Math.abs(diffMs) < 60000) {
            setSelectedReminder('at_deadline');
          } else if (Math.abs(diffHours - 1) < 0.1) {
            setSelectedReminder('1_hour');
          } else if (Math.abs(diffDays - 1) < 0.1) {
            setSelectedReminder('1_day');
          } else if (Math.abs(diffDays - 3) < 0.1) {
            setSelectedReminder('3_days');
          } else {
            setSelectedReminder('at_deadline');
          }
        } else {
          setSelectedReminder('at_deadline');
        }
      } else {
        setReminderEnabled(false);
        setSelectedReminder('none');
      }
    }
  }, [task, visible]);

  const deadlineDate = useMemo(() => {
    if (selectedDeadline === 'custom') return customDeadline;
    return getDeadlineDate(selectedDeadline);
  }, [selectedDeadline, customDeadline]);
  
  const reminderDate = useMemo(() => getReminderDate(deadlineDate, selectedReminder), [deadlineDate, selectedReminder]);

  const handleUpdate = () => {
    if (taskTitle.trim() && task) {
      onUpdate({
        taskId: task.id,
        updates: {
          title: taskTitle.trim(),
          deadline: deadlineDate?.toISOString() || null,
          reminder_time: reminderEnabled ? reminderDate?.toISOString() || null : null,
          priority: selectedPriority,
        },
      });
    }
  };

  const resetForm = () => {
    setTaskTitle("");
    setSelectedDeadline('none');
    setCustomDeadline(null);
    setReminderEnabled(false);
    setSelectedReminder('none');
    setSelectedPriority('medium');
    setShowDeadlineOptions(false);
    setShowReminderOptions(false);
    setShowPriorityOptions(false);
    setShowDatePicker(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const getDeadlineLabel = () => {
    if (selectedDeadline === 'custom' && customDeadline) {
      return formatDeadlineDate(customDeadline);
    }
    const option = DEADLINE_OPTIONS.find(o => o.key === selectedDeadline);
    return option?.label || 'No deadline';
  };

  const formatDeadlineDate = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const formatReminderDateTime = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dateStr = date.toDateString() === today.toDateString() 
      ? 'Today' 
      : date.toDateString() === tomorrow.toDateString()
      ? 'Tomorrow'
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dateStr} at ${timeStr}`;
  };

  const getPriorityOption = () => {
    return PRIORITY_OPTIONS.find(o => o.key === selectedPriority) || PRIORITY_OPTIONS[1];
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.bottomSheetOverlay}>
        <Pressable style={styles.bottomSheetBackdrop} onPress={handleClose} />
        <View style={styles.addTaskSheetContainer}>
          <View style={styles.bottomSheetHandle} />
          <View style={styles.bottomSheetHeader}>
            <Text style={styles.bottomSheetTitle}>Edit Task</Text>
            <Pressable onPress={handleClose} style={styles.bottomSheetClose}>
              <X size={24} color={Colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.addTaskContent} showsVerticalScrollIndicator={false}>
            <View style={styles.taskInputContainer}>
              <TextInput
                style={styles.taskTitleInput}
                placeholder="What needs to be done?"
                placeholderTextColor={Colors.textMuted}
                value={taskTitle}
                onChangeText={setTaskTitle}
                autoFocus
                multiline
                numberOfLines={2}
              />
            </View>

            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setShowDeadlineOptions(!showDeadlineOptions);
                setShowReminderOptions(false);
                setShowPriorityOptions(false);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <View style={styles.optionIconWrapper}>
                <Calendar size={20} color={selectedDeadline !== 'none' ? Colors.accentLight : Colors.textMuted} />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionLabel}>Deadline</Text>
                <Text style={[styles.optionValue, selectedDeadline !== 'none' && styles.optionValueActive]}>
                  {getDeadlineLabel()}
                </Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} style={{ transform: [{ rotate: showDeadlineOptions ? '90deg' : '0deg' }] }} />
            </Pressable>

            {showDeadlineOptions && (
              <View style={styles.optionChipsContainer}>
                {DEADLINE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.optionChip,
                      selectedDeadline === option.key && styles.optionChipActive,
                    ]}
                    onPress={() => {
                      setSelectedDeadline(option.key);
                      if (option.key === 'none') {
                        setSelectedReminder('none');
                        setCustomDeadline(null);
                      }
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={[
                      styles.optionChipText,
                      selectedDeadline === option.key && styles.optionChipTextActive,
                    ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  style={[
                    styles.optionChip,
                    selectedDeadline === 'custom' && styles.optionChipActive,
                  ]}
                  onPress={() => {
                    if (Platform.OS !== 'web') {
                      setShowDatePicker(true);
                      setSelectedDeadline('custom');
                      if (!customDeadline) {
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        tomorrow.setHours(17, 0, 0, 0);
                        setCustomDeadline(tomorrow);
                      }
                    } else {
                      const dateStr = prompt('Enter deadline date (MM/DD/YYYY):');
                      if (dateStr) {
                        const date = new Date(dateStr);
                        if (!isNaN(date.getTime())) {
                          date.setHours(23, 59, 59, 999);
                          setCustomDeadline(date);
                          setSelectedDeadline('custom');
                        }
                      }
                    }
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Calendar size={14} color={selectedDeadline === 'custom' ? Colors.background : Colors.textSecondary} />
                  <Text style={[
                    styles.optionChipText,
                    selectedDeadline === 'custom' && styles.optionChipTextActive,
                  ]}>
                    Custom date
                  </Text>
                </Pressable>
              </View>
            )}
            
            {selectedDeadline !== 'none' && deadlineDate && (
              <View style={styles.selectedDateTimeContainer}>
                <Calendar size={14} color={Colors.accentLight} />
                <Text style={styles.selectedDateTimeText}>
                  Due: {formatDeadlineDate(deadlineDate)}
                </Text>
              </View>
            )}

            <View style={[styles.optionRow, selectedDeadline === 'none' && styles.optionRowDisabled]}>
              <View style={styles.optionIconWrapper}>
                <Bell size={20} color={reminderEnabled && selectedDeadline !== 'none' ? Colors.accentLight : Colors.textMuted} />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionLabel, selectedDeadline === 'none' && styles.optionLabelDisabled]}>Reminder</Text>
                <Text style={[
                  styles.optionValue,
                  selectedDeadline === 'none' && styles.optionValueDisabled,
                ]}>
                  {selectedDeadline === 'none' ? 'Set deadline first' : (reminderEnabled ? 'Enabled' : 'Disabled')}
                </Text>
              </View>
              <Switch
                value={reminderEnabled && selectedDeadline !== 'none'}
                onValueChange={(value) => {
                  if (selectedDeadline === 'none') return;
                  setReminderEnabled(value);
                  if (value) {
                    setShowReminderOptions(true);
                    setShowDeadlineOptions(false);
                    setShowPriorityOptions(false);
                    if (selectedReminder === 'none') {
                      setSelectedReminder('at_deadline');
                    }
                  } else {
                    setShowReminderOptions(false);
                  }
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                disabled={selectedDeadline === 'none'}
                trackColor={{ false: Colors.border, true: Colors.accentLight }}
                thumbColor={Colors.background}
              />
            </View>

            {showReminderOptions && reminderEnabled && selectedDeadline !== 'none' && (
              <View style={styles.optionChipsContainer}>
                {REMINDER_OPTIONS.filter(opt => opt.key !== 'none').map((option) => (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.optionChip,
                      selectedReminder === option.key && styles.optionChipActive,
                    ]}
                    onPress={() => {
                      setSelectedReminder(option.key);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={[
                      styles.optionChipText,
                      selectedReminder === option.key && styles.optionChipTextActive,
                    ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            
            {reminderEnabled && selectedReminder !== 'none' && reminderDate && (
              <View style={styles.selectedDateTimeContainer}>
                <Bell size={14} color={Colors.accentLight} />
                <Text style={styles.selectedDateTimeText}>
                  Remind: {formatReminderDateTime(reminderDate)}
                </Text>
              </View>
            )}

            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setShowPriorityOptions(!showPriorityOptions);
                setShowDeadlineOptions(false);
                setShowReminderOptions(false);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <View style={styles.optionIconWrapper}>
                <Flag size={20} color={getPriorityOption().color} />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionLabel}>Priority</Text>
                <Text style={[styles.optionValue, { color: getPriorityOption().color }]}>
                  {getPriorityOption().label}
                </Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} style={{ transform: [{ rotate: showPriorityOptions ? '90deg' : '0deg' }] }} />
            </Pressable>

            {showPriorityOptions && (
              <View style={styles.optionChipsContainer}>
                {PRIORITY_OPTIONS.map((option) => (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.optionChip,
                      selectedPriority === option.key && styles.optionChipActive,
                      { borderColor: option.color },
                    ]}
                    onPress={() => {
                      setSelectedPriority(option.key);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Flag size={14} color={selectedPriority === option.key ? Colors.background : option.color} />
                    <Text style={[
                      styles.optionChipText,
                      selectedPriority === option.key && styles.optionChipTextActive,
                    ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={{ height: 20 }} />
          </ScrollView>

          {Platform.OS !== 'web' && showDatePicker && customDeadline && (
            <Modal
              transparent
              animationType="fade"
              visible={showDatePicker}
              onRequestClose={() => setShowDatePicker(false)}
            >
              <View style={styles.datePickerOverlay}>
                <Pressable 
                  style={styles.datePickerBackdrop} 
                  onPress={() => setShowDatePicker(false)}
                />
                <View style={styles.datePickerContainer}>
                  <View style={styles.datePickerHeader}>
                    <Text style={styles.datePickerTitle}>Select Deadline</Text>
                    <Pressable onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.datePickerDoneButton}>Done</Text>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    value={customDeadline}
                    mode="date"
                    display="spinner"
                    onChange={(event: any, date?: Date) => {
                      if (date) {
                        date.setHours(23, 59, 59, 999);
                        setCustomDeadline(date);
                      }
                    }}
                    minimumDate={new Date()}
                  />
                </View>
              </View>
            </Modal>
          )}

          <View style={styles.addTaskFooter}>
            <Pressable
              style={[
                styles.addTaskButton,
                !taskTitle.trim() && styles.addTaskButtonDisabled,
              ]}
              onPress={handleUpdate}
              disabled={!taskTitle.trim() || isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <Text style={styles.addTaskButtonText}>Save Changes</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const AddTaskSheet = ({ visible, onClose, onAdd, isCreating, meetingTitle }: any) => {
  const [taskTitle, setTaskTitle] = useState("");
  const [selectedDeadline, setSelectedDeadline] = useState<DeadlineOption>('none');
  const [customDeadline, setCustomDeadline] = useState<Date | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<ReminderOption>('none');
  const [selectedPriority, setSelectedPriority] = useState<PriorityOption>('medium');
  const [showDeadlineOptions, setShowDeadlineOptions] = useState(false);
  const [showReminderOptions, setShowReminderOptions] = useState(false);
  const [showPriorityOptions, setShowPriorityOptions] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);



  const deadlineDate = useMemo(() => {
    if (selectedDeadline === 'custom') return customDeadline;
    return getDeadlineDate(selectedDeadline);
  }, [selectedDeadline, customDeadline]);
  
  const reminderDate = useMemo(() => getReminderDate(deadlineDate, selectedReminder), [deadlineDate, selectedReminder]);

  const handleAdd = () => {
    if (taskTitle.trim()) {
      onAdd({
        title: taskTitle.trim(),
        deadline: deadlineDate?.toISOString() || null,
        reminder_time: reminderEnabled ? reminderDate?.toISOString() || null : null,
        priority: selectedPriority,
      });
      resetForm();
    }
  };

  const resetForm = () => {
    setTaskTitle("");
    setSelectedDeadline('none');
    setCustomDeadline(null);
    setReminderEnabled(false);
    setSelectedReminder('none');
    setSelectedPriority('medium');
    setShowDeadlineOptions(false);
    setShowReminderOptions(false);
    setShowPriorityOptions(false);
    setShowDatePicker(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const getDeadlineLabel = () => {
    if (selectedDeadline === 'custom' && customDeadline) {
      return formatDeadlineDate(customDeadline);
    }
    const option = DEADLINE_OPTIONS.find(o => o.key === selectedDeadline);
    return option?.label || 'No deadline';
  };

  const formatDeadlineDate = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const formatReminderDateTime = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dateStr = date.toDateString() === today.toDateString() 
      ? 'Today' 
      : date.toDateString() === tomorrow.toDateString()
      ? 'Tomorrow'
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dateStr} at ${timeStr}`;
  };

  const getPriorityOption = () => {
    return PRIORITY_OPTIONS.find(o => o.key === selectedPriority) || PRIORITY_OPTIONS[1];
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.bottomSheetOverlay}>
        <Pressable style={styles.bottomSheetBackdrop} onPress={handleClose} />
        <View style={styles.addTaskSheetContainer}>
          <View style={styles.bottomSheetHandle} />
          <View style={styles.bottomSheetHeader}>
            <Text style={styles.bottomSheetTitle}>Add Task</Text>
            <Pressable onPress={handleClose} style={styles.bottomSheetClose}>
              <X size={24} color={Colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.addTaskContent} showsVerticalScrollIndicator={false}>
            <View style={styles.taskInputContainer}>
              <TextInput
                style={styles.taskTitleInput}
                placeholder="What needs to be done?"
                placeholderTextColor={Colors.textMuted}
                value={taskTitle}
                onChangeText={setTaskTitle}
                autoFocus
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Deadline Section */}
            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setShowDeadlineOptions(!showDeadlineOptions);
                setShowReminderOptions(false);
                setShowPriorityOptions(false);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <View style={styles.optionIconWrapper}>
                <Calendar size={20} color={selectedDeadline !== 'none' ? Colors.accentLight : Colors.textMuted} />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionLabel}>Deadline</Text>
                <Text style={[styles.optionValue, selectedDeadline !== 'none' && styles.optionValueActive]}>
                  {getDeadlineLabel()}
                </Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} style={{ transform: [{ rotate: showDeadlineOptions ? '90deg' : '0deg' }] }} />
            </Pressable>

            {showDeadlineOptions && (
              <View style={styles.optionChipsContainer}>
                {DEADLINE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.optionChip,
                      selectedDeadline === option.key && styles.optionChipActive,
                    ]}
                    onPress={() => {
                      setSelectedDeadline(option.key);
                      if (option.key === 'none') {
                        setSelectedReminder('none');
                        setCustomDeadline(null);
                      }
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={[
                      styles.optionChipText,
                      selectedDeadline === option.key && styles.optionChipTextActive,
                    ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  style={[
                    styles.optionChip,
                    selectedDeadline === 'custom' && styles.optionChipActive,
                  ]}
                  onPress={() => {
                    if (Platform.OS !== 'web') {
                      setShowDatePicker(true);
                      setSelectedDeadline('custom');
                      if (!customDeadline) {
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        tomorrow.setHours(17, 0, 0, 0);
                        setCustomDeadline(tomorrow);
                      }
                    } else {
                      const dateStr = prompt('Enter deadline date (MM/DD/YYYY):');
                      if (dateStr) {
                        const date = new Date(dateStr);
                        if (!isNaN(date.getTime())) {
                          date.setHours(23, 59, 59, 999);
                          setCustomDeadline(date);
                          setSelectedDeadline('custom');
                        }
                      }
                    }
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Calendar size={14} color={selectedDeadline === 'custom' ? Colors.background : Colors.textSecondary} />
                  <Text style={[
                    styles.optionChipText,
                    selectedDeadline === 'custom' && styles.optionChipTextActive,
                  ]}>
                    Custom date
                  </Text>
                </Pressable>
              </View>
            )}
            
            {selectedDeadline !== 'none' && deadlineDate && (
              <View style={styles.selectedDateTimeContainer}>
                <Calendar size={14} color={Colors.accentLight} />
                <Text style={styles.selectedDateTimeText}>
                  Due: {formatDeadlineDate(deadlineDate)}
                </Text>
              </View>
            )}

            {/* Reminder Section */}
            <View style={[styles.optionRow, selectedDeadline === 'none' && styles.optionRowDisabled]}>
              <View style={styles.optionIconWrapper}>
                <Bell size={20} color={reminderEnabled && selectedDeadline !== 'none' ? Colors.accentLight : Colors.textMuted} />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionLabel, selectedDeadline === 'none' && styles.optionLabelDisabled]}>Reminder</Text>
                <Text style={[
                  styles.optionValue,
                  selectedDeadline === 'none' && styles.optionValueDisabled,
                ]}>
                  {selectedDeadline === 'none' ? 'Set deadline first' : (reminderEnabled ? 'Enabled' : 'Disabled')}
                </Text>
              </View>
              <Switch
                value={reminderEnabled && selectedDeadline !== 'none'}
                onValueChange={(value) => {
                  if (selectedDeadline === 'none') return;
                  setReminderEnabled(value);
                  if (value) {
                    setShowReminderOptions(true);
                    setShowDeadlineOptions(false);
                    setShowPriorityOptions(false);
                    if (selectedReminder === 'none') {
                      setSelectedReminder('at_deadline');
                    }
                  } else {
                    setShowReminderOptions(false);
                  }
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                disabled={selectedDeadline === 'none'}
                trackColor={{ false: Colors.border, true: Colors.accentLight }}
                thumbColor={Colors.background}
              />
            </View>

            {showReminderOptions && reminderEnabled && selectedDeadline !== 'none' && (
              <View style={styles.optionChipsContainer}>
                {REMINDER_OPTIONS.filter(opt => opt.key !== 'none').map((option) => (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.optionChip,
                      selectedReminder === option.key && styles.optionChipActive,
                    ]}
                    onPress={() => {
                      setSelectedReminder(option.key);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={[
                      styles.optionChipText,
                      selectedReminder === option.key && styles.optionChipTextActive,
                    ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            
            {reminderEnabled && selectedReminder !== 'none' && reminderDate && (
              <View style={styles.selectedDateTimeContainer}>
                <Bell size={14} color={Colors.accentLight} />
                <Text style={styles.selectedDateTimeText}>
                  Remind: {formatReminderDateTime(reminderDate)}
                </Text>
              </View>
            )}

            {/* Priority Section */}
            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setShowPriorityOptions(!showPriorityOptions);
                setShowDeadlineOptions(false);
                setShowReminderOptions(false);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <View style={styles.optionIconWrapper}>
                <Flag size={20} color={getPriorityOption().color} />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionLabel}>Priority</Text>
                <Text style={[styles.optionValue, { color: getPriorityOption().color }]}>
                  {getPriorityOption().label}
                </Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} style={{ transform: [{ rotate: showPriorityOptions ? '90deg' : '0deg' }] }} />
            </Pressable>

            {showPriorityOptions && (
              <View style={styles.optionChipsContainer}>
                {PRIORITY_OPTIONS.map((option) => (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.optionChip,
                      selectedPriority === option.key && styles.optionChipActive,
                      { borderColor: option.color },
                    ]}
                    onPress={() => {
                      setSelectedPriority(option.key);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Flag size={14} color={selectedPriority === option.key ? Colors.background : option.color} />
                    <Text style={[
                      styles.optionChipText,
                      selectedPriority === option.key && styles.optionChipTextActive,
                    ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={{ height: 20 }} />
          </ScrollView>

          {Platform.OS !== 'web' && showDatePicker && customDeadline && (
            <Modal
              transparent
              animationType="fade"
              visible={showDatePicker}
              onRequestClose={() => setShowDatePicker(false)}
            >
              <View style={styles.datePickerOverlay}>
                <Pressable 
                  style={styles.datePickerBackdrop} 
                  onPress={() => setShowDatePicker(false)}
                />
                <View style={styles.datePickerContainer}>
                  <View style={styles.datePickerHeader}>
                    <Text style={styles.datePickerTitle}>Select Deadline</Text>
                    <Pressable onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.datePickerDoneButton}>Done</Text>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    value={customDeadline}
                    mode="date"
                    display="spinner"
                    onChange={(event: any, date?: Date) => {
                      if (date) {
                        date.setHours(23, 59, 59, 999);
                        setCustomDeadline(date);
                      }
                    }}
                    minimumDate={new Date()}
                  />
                </View>
              </View>
            </Modal>
          )}

          <View style={styles.addTaskFooter}>
            <Pressable
              style={[
                styles.addTaskButton,
                !taskTitle.trim() && styles.addTaskButtonDisabled,
              ]}
              onPress={handleAdd}
              disabled={!taskTitle.trim() || isCreating}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <Text style={styles.addTaskButtonText}>Add Task</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Meeting Actions Bottom Sheet Component
const MeetingActionsSheet = ({
  visible,
  onClose,
  onAddTask,
  onEdit,
  onShare,
  onDelete,
}: any) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.bottomSheetOverlay}>
        <Pressable style={styles.bottomSheetBackdrop} onPress={onClose} />
        <View style={styles.actionsSheetContainer}>
          <View style={styles.bottomSheetHandle} />
          <View style={styles.actionsSheetHeader}>
            <Text style={styles.bottomSheetTitle}>Actions</Text>
            <Pressable onPress={onClose} style={styles.bottomSheetClose}>
              <X size={24} color={Colors.text} />
            </Pressable>
          </View>

          <View style={styles.actionsSheetContent}>
            <Pressable
              style={styles.actionSheetItem}
              onPress={() => {
                onClose();
                setTimeout(onAddTask, 300);
              }}
            >
              <View style={styles.actionSheetIconWrapper}>
                <Plus size={20} color={Colors.accentLight} />
              </View>
              <View style={styles.actionSheetTextContainer}>
                <Text style={styles.actionSheetItemTitle}>Add Task</Text>
                <Text style={styles.actionSheetItemDescription}>
                  Create a new action item for this meeting
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.actionSheetItem}
              onPress={() => {
                onClose();
                setTimeout(onEdit, 300);
              }}
            >
              <View style={styles.actionSheetIconWrapper}>
                <Edit3 size={20} color={Colors.accentLight} />
              </View>
              <View style={styles.actionSheetTextContainer}>
                <Text style={styles.actionSheetItemTitle}>Edit Meeting</Text>
                <Text style={styles.actionSheetItemDescription}>
                  Update meeting details and settings
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.actionSheetItem}
              onPress={() => {
                onClose();
                setTimeout(onShare, 300);
              }}
            >
              <View style={styles.actionSheetIconWrapper}>
                <Share2 size={20} color={Colors.accentLight} />
              </View>
              <View style={styles.actionSheetTextContainer}>
                <Text style={styles.actionSheetItemTitle}>Share</Text>
                <Text style={styles.actionSheetItemDescription}>
                  Share meeting notes and summary
                </Text>
              </View>
            </Pressable>

            <View style={styles.actionSheetDivider} />

            <Pressable
              style={styles.actionSheetItem}
              onPress={() => {
                onClose();
                setTimeout(onDelete, 300);
              }}
            >
              <View style={[styles.actionSheetIconWrapper, styles.actionSheetIconDanger]}>
                <Trash2 size={20} color={Colors.error} />
              </View>
              <View style={styles.actionSheetTextContainer}>
                <Text style={[styles.actionSheetItemTitle, styles.actionSheetItemTitleDanger]}>
                  Delete Meeting
                </Text>
                <Text style={styles.actionSheetItemDescription}>
                  Permanently remove this meeting
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Floating Action Button Component
const FloatingActionButton = ({ onPress, audioBarHeight }: any) => {
  return (
    <Pressable
      style={[
        styles.fabMain,
        { bottom: audioBarHeight + 16, right: 16 },
      ]}
      onPress={onPress}
    >
      <Plus size={28} color={Colors.background} />
    </Pressable>
  );
};

export default function MeetingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: meeting, isLoading } = useMeetingDetails(id || null);
  const { deleteMeeting, retryTranscoding, isTranscoding, updateMeetingDetails } = useMeetings();
  const { data: tasks = [], isLoading: tasksLoading } = useMeetingTasks(
    id || null
  );
  const { createTask, updateTask, deleteTask, isCreating, isUpdating } = useTasks();
  const { contacts } = useContacts();

  const [showInsights, setShowInsights] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);
  const [showActionsSheet, setShowActionsSheet] = useState(false);
  const [editingTask, setEditingTask] = useState<MeetingTask | null>(null);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [showMeetingTypeDropdown, setShowMeetingTypeDropdown] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);

  const soundRef = useRef<Audio.Sound | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioLoadError, setAudioLoadError] = useState(false);
  const [audioErrorMessage, setAudioErrorMessage] = useState<string | null>(
    null
  );
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  const title = meeting?.title_override || meeting?.auto_title || "Meeting";
  const aiOutput = meeting?.ai_output;

  // Unified actions list (merge tasks and AI-generated actions)
  const unifiedActions: UnifiedAction[] = useMemo(() => {
    const manualTasks: UnifiedAction[] = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      completed: task.completed,
      owner: task.owner,
      dueDate: task.deadline || task.reminder_time,
      isAIGenerated: false,
      rawTask: task,
    }));

    const aiActions: UnifiedAction[] =
      aiOutput?.follow_up_actions?.map((action: any, index: number) => ({
        id: `ai-${index}`,
        title: action.action,
        completed: action.completed || false,
        owner:
          action.owner !== "UNKNOWN" && action.owner !== "LAWYER"
            ? action.owner
            : null,
        dueDate: action.deadline,
        isAIGenerated: true,
        rawTask: action,
      })) || [];

    return [...manualTasks, ...aiActions];
  }, [tasks, aiOutput]);

  // Audio playback
  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        console.error("[AudioPlayer] Playback error:", status.error);
      }
      return;
    }

    setIsPlaying(status.isPlaying);
    setPositionMillis(status.positionMillis || 0);
    setDurationMillis(status.durationMillis || 0);

    if (status.didJustFinish) {
      setIsPlaying(false);
      setPositionMillis(0);
    }
  }, []);

  const loadAudio = useCallback(async () => {
    if (!meeting?.audio_path || soundRef.current) return;

    try {
      setIsAudioLoading(true);
      setAudioLoadError(false);
      setAudioErrorMessage(null);

      const { data: audioBlob, error: downloadError } = await supabase.storage
        .from("meeting-audio")
        .download(meeting.audio_path);

      if (downloadError || !audioBlob) {
        setAudioLoadError(true);
        setAudioErrorMessage("Could not download audio");
        return;
      }

      const blobType = audioBlob.type || "";
      const filePath = meeting.audio_path.toLowerCase();

      let isActuallyWebm = false;
      try {
        const headerBytes = new Uint8Array(
          await audioBlob.slice(0, 4).arrayBuffer()
        );
        isActuallyWebm =
          headerBytes[0] === 0x1a &&
          headerBytes[1] === 0x45 &&
          headerBytes[2] === 0xdf &&
          headerBytes[3] === 0xa3;
      } catch {
        // Ignore
      }

      const isWebmFormat =
        isActuallyWebm || blobType.includes("webm") || filePath.endsWith(".webm");
      const isOggFormat =
        blobType.includes("ogg") || filePath.endsWith(".ogg");

      if (Platform.OS === "ios" && (isWebmFormat || isOggFormat)) {
        setAudioLoadError(true);
        setAudioErrorMessage(
          "This recording was made on web and cannot be played on iOS. Open in web browser to listen."
        );
        return;
      }

      let audioUri: string;

      if (Platform.OS === "web") {
        audioUri = URL.createObjectURL(audioBlob);
        blobUrlRef.current = audioUri;
      } else {
        const reader = new FileReader();
        audioUri = await new Promise<string>((resolve, reject) => {
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

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: false, progressUpdateIntervalMillis: 100 },
        onPlaybackStatusUpdate
      );

      soundRef.current = sound;
      setAudioLoadError(false);
      setAudioErrorMessage(null);
    } catch {
      setAudioLoadError(true);
      setAudioErrorMessage("Could not play audio");
    } finally {
      setIsAudioLoading(false);
    }
  }, [meeting?.audio_path, onPlaybackStatusUpdate]);

  useEffect(() => {
    const canLoadAudio =
      meeting?.audio_path &&
      meeting?.status === "ready" &&
      meeting?.audio_format !== "transcoding" &&
      meeting?.audio_format !== "failed";

    if (canLoadAudio) {
      loadAudio();
    }

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      if (blobUrlRef.current && Platform.OS === "web") {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [meeting?.audio_path, meeting?.status, meeting?.audio_format, loadAudio]);

  const handlePlayPause = async () => {
    if (!soundRef.current) {
      await loadAudio();
      return;
    }

    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        await soundRef.current.playAsync();
      }
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.error("[AudioPlayer] Play/pause error:", error);
    }
  };

  const handleSeek = async (event: { nativeEvent: { locationX: number } }) => {
    if (!soundRef.current || !durationMillis || !progressBarWidth) return;

    const x = event.nativeEvent.locationX;
    const percentage = Math.max(0, Math.min(1, x / progressBarWidth));
    const seekPosition = percentage * durationMillis;

    try {
      await soundRef.current.setPositionAsync(seekPosition);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.error("[AudioPlayer] Seek error:", error);
    }
  };

  const handleSeekToTimestamp = async (ms: number) => {
    if (!soundRef.current) return;
    try {
      await soundRef.current.setPositionAsync(ms);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.error("[AudioPlayer] Seek error:", error);
    }
  };

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} min`;
  };

  const formatBillable = (seconds: number, rate: number) => {
    const hours = seconds / 3600;
    return `$${(hours * rate).toFixed(2)}`;
  };

  const progress = durationMillis > 0 ? (positionMillis / durationMillis) * 100 : 0;

  const handleDelete = async () => {
    if (!id) return;

    const performDelete = async () => {
      try {
        await deleteMeeting(id);
        router.replace("/(tabs)/home");
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

  const handleToggleAction = async (action: UnifiedAction) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (action.isAIGenerated) {
      // AI-generated actions don't persist, just visual feedback
      // In future, could sync to backend
    } else {
      await updateTask({ taskId: action.id, updates: { completed: !action.completed } });
    }
  };

  const handleDeleteTask = (taskId: string) => {
    const performDelete = async () => {
      try {
        await deleteTask(taskId);
      } catch (error) {
        console.error("[MeetingDetail] Error deleting task:", error);
      }
    };

    if (Platform.OS === "web") {
      if (confirm("Delete this task?")) {
        performDelete();
      }
    } else {
      Alert.alert("Delete Task", "Are you sure you want to delete this task?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: performDelete },
      ]);
    }
  };

  const handleAddTask = async (taskData: {
    title: string;
    deadline: string | null;
    reminder_time: string | null;
    priority: 'low' | 'medium' | 'high';
  }) => {
    if (!id) return;

    try {
      let owner: string | null = null;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        
        if (session?.access_token && supabaseUrl) {
          const response = await fetch(
            `${supabaseUrl}/functions/v1/enhance-task`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                meeting_id: id,
                task_title: taskData.title,
              }),
            }
          );

          if (response.ok) {
            const enhancedData = await response.json();
            owner = enhancedData.owner;
            console.log("[EnhanceTask] AI suggestions:", enhancedData);
          }
        }
      } catch (enhanceError) {
        console.warn("[EnhanceTask] Enhancement failed:", enhanceError);
      }

      await createTask({
        meeting_id: id,
        title: taskData.title,
        description: null,
        priority: taskData.priority,
        deadline: taskData.deadline,
        reminder_time: taskData.reminder_time,
        owner,
      });

      setShowQuickAdd(false);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("[MeetingDetail] Error adding task:", error);
    }
  };

  const handleShare = async () => {
    const shareText = `
${title}
Date: ${new Date(meeting?.created_at || "").toLocaleDateString()}
Duration: ${formatDuration(meeting?.duration_seconds || 0)}

Summary:
${aiOutput?.meeting_overview.one_sentence_summary || "No summary available"}

Action Items:
${unifiedActions.map((a, i) => `${i + 1}. ${a.title}`).join("\n")}
    `.trim();

    try {
      if (Platform.OS === "web") {
        await navigator.clipboard.writeText(shareText);
        alert("Meeting notes copied to clipboard!");
      } else {
        await Share.share({
          message: shareText,
          title: title,
        });
      }
    } catch (error) {
      console.error("[Share] Error:", error);
    }
  };

  if (isLoading || !meeting) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accentLight} />
        </View>
      </SafeAreaView>
    );
  }

  const audioBarHeight = meeting.audio_path && meeting.status === "ready" ? 80 : 0;

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
          <View style={styles.headerMeta}>
            <Text style={styles.headerSubtitle}>
              {new Date(meeting.created_at).toLocaleDateString()}
            </Text>
            <View style={styles.dot} />
            <Clock size={12} color={Colors.textMuted} />
            <Text style={styles.headerSubtitle}>
              {formatDuration(meeting.duration_seconds)}
            </Text>
          </View>
        </View>
        <Pressable
          style={styles.headerEditButton}
          onPress={() => setShowEditMenu(!showEditMenu)}
        >
          <Edit3 size={18} color={Colors.text} />
        </Pressable>
      </View>

      {/* Edit Menu Dropdown */}
      {showEditMenu && (
        <View style={styles.editMenuDropdown}>
          <Pressable
            style={styles.editMenuItem}
            onPress={() => {
              setShowEditMenu(false);
              router.push(`/edit-meeting?id=${id}` as any);
            }}
          >
            <Edit3 size={18} color={Colors.text} />
            <Text style={styles.editMenuItemText}>Edit Meeting</Text>
          </Pressable>
          <Pressable style={styles.editMenuItem} onPress={handleDelete}>
            <Trash2 size={18} color={Colors.error} />
            <Text style={[styles.editMenuItemText, { color: Colors.error }]}>
              Delete
            </Text>
          </Pressable>
        </View>
      )}

      {/* Scrollable Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Meeting Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Meeting Details</Text>
          
          {/* Total Time */}
          <View style={styles.detailRow}>
            <View style={styles.detailIconWrapper}>
              <Clock size={18} color={Colors.accentLight} />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Total Time Logged</Text>
              <Text style={styles.detailValue}>{formatDuration(meeting.duration_seconds)}</Text>
            </View>
          </View>

          {/* Contact Selector */}
          <Pressable
            style={styles.detailRow}
            onPress={() => {
              setShowContactDropdown(!showContactDropdown);
              setShowMeetingTypeDropdown(false);
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <View style={styles.detailIconWrapper}>
              <User size={18} color={Colors.accentLight} />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Contact</Text>
              <Text style={styles.detailValue}>
                {meeting.primary_contact_id
                  ? contacts.find(c => c.id === meeting.primary_contact_id)?.full_name || 'Unknown Contact'
                  : meeting.client_name || 'Not assigned'}
              </Text>
            </View>
            <ChevronDown size={18} color={Colors.textMuted} style={{ transform: [{ rotate: showContactDropdown ? '180deg' : '0deg' }] }} />
          </Pressable>

          {showContactDropdown && (
            <View style={styles.dropdownContainer}>
              <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                <Pressable
                  style={styles.dropdownItem}
                  onPress={async () => {
                    if (id) {
                      await updateMeetingDetails(id, { primary_contact_id: null, client_name: null });
                      setShowContactDropdown(false);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                >
                  <Text style={styles.dropdownItemText}>None</Text>
                  {!meeting.primary_contact_id && !meeting.client_name && (
                    <Check size={16} color={Colors.accentLight} />
                  )}
                </Pressable>
                {contacts.map((contact) => (
                  <Pressable
                    key={contact.id}
                    style={styles.dropdownItem}
                    onPress={async () => {
                      if (id) {
                        await updateMeetingDetails(id, { primary_contact_id: contact.id, client_name: contact.full_name });
                        setShowContactDropdown(false);
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                  >
                    <View style={styles.dropdownItemInfo}>
                      <Text style={styles.dropdownItemText}>{contact.full_name}</Text>
                      {contact.company && (
                        <Text style={styles.dropdownItemSubtext}>{contact.company}</Text>
                      )}
                    </View>
                    {meeting.primary_contact_id === contact.id && (
                      <Check size={16} color={Colors.accentLight} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Meeting Type */}
          <Pressable
            style={styles.detailRow}
            onPress={() => {
              setShowMeetingTypeDropdown(!showMeetingTypeDropdown);
              setShowContactDropdown(false);
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <View style={styles.detailIconWrapper}>
              <FileText size={18} color={Colors.accentLight} />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Meeting Type</Text>
              <Text style={styles.detailValue}>{meeting.meeting_type}</Text>
            </View>
            <ChevronDown size={18} color={Colors.textMuted} style={{ transform: [{ rotate: showMeetingTypeDropdown ? '180deg' : '0deg' }] }} />
          </Pressable>

          {showMeetingTypeDropdown && (
            <View style={styles.dropdownContainer}>
              <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                {MEETING_TYPES.map((type) => (
                  <Pressable
                    key={type}
                    style={styles.dropdownItem}
                    onPress={async () => {
                      if (id) {
                        await updateMeetingDetails(id, { meeting_type: type });
                        setShowMeetingTypeDropdown(false);
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                  >
                    <Text style={styles.dropdownItemText}>{type}</Text>
                    {meeting.meeting_type === type && (
                      <Check size={16} color={Colors.accentLight} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Billable Toggle */}
          <View style={styles.detailRow}>
            <View style={styles.detailIconWrapper}>
              <DollarSign size={18} color={Colors.accentLight} />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Billable</Text>
            </View>
            <View style={styles.billableToggleContainer}>
              <Text style={[styles.billableToggleLabel, !meeting.billable && styles.billableToggleLabelActive]}>No</Text>
              <Switch
                value={meeting.billable}
                onValueChange={async (value) => {
                  if (id) {
                    await updateMeetingDetails(id, { billable: value });
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                }}
                trackColor={{ false: Colors.border, true: Colors.success }}
                thumbColor={Colors.background}
              />
              <Text style={[styles.billableToggleLabel, meeting.billable && styles.billableToggleLabelActive]}>Yes</Text>
            </View>
          </View>
        </View>
        {/* Summary Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Summary</Text>
          {aiOutput ? (
            <>
              {aiOutput.meeting_overview.topics.length > 0 && (
                <View style={styles.topicsRow}>
                  {aiOutput.meeting_overview.topics.map(
                    (topic: string, i: number) => (
                      <View key={i} style={styles.topicChip}>
                        <Text style={styles.topicChipText}>{topic}</Text>
                      </View>
                    )
                  )}
                </View>
              )}
              <Text style={styles.summaryText}>
                {aiOutput.meeting_overview.one_sentence_summary}
              </Text>
              <Pressable
                style={styles.viewDetailsLink}
                onPress={() => setShowInsights(true)}
              >
                <Text style={styles.viewDetailsLinkText}>View Details</Text>
                <ChevronDown
                  size={16}
                  color={Colors.accentLight}
                  style={{ transform: [{ rotate: "-90deg" }] }}
                />
              </Pressable>
            </>
          ) : (
            <Text style={styles.noDataText}>
              {meeting.status === "processing"
                ? "Summary is being generated..."
                : "No summary available"}
            </Text>
          )}
        </View>

        {/* Action Items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Action Items ({unifiedActions.length})</Text>
          {tasksLoading ? (
            <ActivityIndicator size="small" color={Colors.accentLight} />
          ) : unifiedActions.length > 0 ? (
            unifiedActions.map((action) => (
              <View key={action.id} style={styles.actionItem}>
                <Pressable
                  style={styles.actionCheckbox}
                  onPress={() => handleToggleAction(action)}
                >
                  {action.completed ? (
                    <CheckCircle2
                      size={22}
                      color={Colors.success}
                      fill={Colors.success}
                    />
                  ) : (
                    <Circle size={22} color={Colors.border} />
                  )}
                </Pressable>
                <View style={styles.actionContent}>
                  <View style={styles.actionTitleRow}>
                    <Text
                      style={[
                        styles.actionTitle,
                        action.completed && styles.actionTitleCompleted,
                      ]}
                      numberOfLines={2}
                    >
                      {action.title}
                    </Text>
                    {action.isAIGenerated && (
                      <Sparkles size={14} color={Colors.accentLight} />
                    )}
                  </View>
                  {(action.owner || action.dueDate) && (
                    <View style={styles.actionMeta}>
                      {action.owner && (
                        <Text style={styles.actionMetaText}>• {action.owner}</Text>
                      )}
                      {action.dueDate && (
                        <Text style={styles.actionMetaText}>
                          • {new Date(action.dueDate).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
                {!action.isAIGenerated && (
                  <View style={styles.actionButtons}>
                    <Pressable
                      style={styles.actionEditButton}
                      onPress={() => {
                        setEditingTask(action.rawTask);
                        if (Platform.OS !== 'web') {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                      }}
                    >
                      <Edit2 size={16} color={Colors.accentLight} />
                    </Pressable>
                    <Pressable
                      style={styles.actionDeleteButton}
                      onPress={() => handleDeleteTask(action.id)}
                    >
                      <Trash2 size={16} color={Colors.error} />
                    </Pressable>
                  </View>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.noDataText}>
              {meeting.status === "processing"
                ? "Tasks are being generated..."
                : "No action items yet. Tap + to add one."}
            </Text>
          )}
        </View>

        {/* Billing Card */}
        {meeting.billable && (
          <View style={styles.card}>
            <View style={styles.billingRow}>
              <View style={styles.billingIconWrapper}>
                <DollarSign size={20} color={Colors.success} />
              </View>
              <View style={styles.billingContent}>
                <Text style={styles.billingLabel}>Billable Amount</Text>
                <Text style={styles.billingAmount}>
                  {formatBillable(
                    meeting.billable_seconds,
                    meeting.hourly_rate_snapshot
                  )}
                </Text>
                <Text style={styles.billingDetail}>
                  {formatDuration(meeting.billable_seconds)} @ $
                  {meeting.hourly_rate_snapshot}/hr
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Audio Player */}
      {meeting.audio_path && meeting.status === "ready" && (
        <View style={styles.audioBar}>
          {meeting.audio_format === "transcoding" ? (
            <View style={styles.audioErrorContainer}>
              <Loader size={16} color={Colors.accentLight} />
              <Text style={styles.audioErrorText}>
                Audio is being prepared for playback...
              </Text>
            </View>
          ) : meeting.audio_format === "failed" ? (
            <View style={styles.audioErrorContainer}>
              <AlertTriangle size={16} color={Colors.warning} />
              <Text style={styles.audioErrorText} numberOfLines={1}>
                Audio conversion failed
              </Text>
              <Pressable
                style={styles.retryButton}
                onPress={() => retryTranscoding(meeting.id)}
                disabled={isTranscoding}
              >
                {isTranscoding ? (
                  <ActivityIndicator size="small" color={Colors.accentLight} />
                ) : (
                  <>
                    <RefreshCw size={14} color={Colors.accentLight} />
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : audioLoadError ? (
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
                disabled={isAudioLoading}
              >
                {isPlaying ? (
                  <Pause size={20} color={Colors.text} fill={Colors.text} />
                ) : (
                  <Play size={20} color={Colors.text} fill={Colors.text} />
                )}
              </Pressable>

              <Pressable
                style={styles.audioProgressContainer}
                onPress={handleSeek}
              >
                <View
                  style={styles.audioProgress}
                  onLayout={(e) =>
                    setProgressBarWidth(e.nativeEvent.layout.width)
                  }
                >
                  <View
                    style={[styles.audioProgressBar, { width: `${progress}%` }]}
                  />
                  <View
                    style={[styles.audioProgressThumb, { left: `${progress}%` }]}
                  />
                </View>
              </Pressable>

              <Text style={styles.audioTime}>
                {formatTime(positionMillis)} /{" "}
                {formatTime(durationMillis || meeting.duration_seconds * 1000)}
              </Text>

              <Pressable
                style={styles.transcriptButton}
                onPress={() => setShowTranscript(true)}
              >
                <Text style={styles.transcriptButtonText}>Transcript</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {/* FAB */}
      <FloatingActionButton
        onPress={() => {
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          setShowActionsSheet(true);
        }}
        audioBarHeight={audioBarHeight}
      />

      {/* Modals */}
      <MeetingActionsSheet
        visible={showActionsSheet}
        onClose={() => setShowActionsSheet(false)}
        onAddTask={() => setShowQuickAdd(true)}
        onEdit={() => router.push(`/edit-meeting?id=${id}` as any)}
        onShare={handleShare}
        onDelete={handleDelete}
      />

      <InsightsBottomSheet
        visible={showInsights}
        onClose={() => setShowInsights(false)}
        aiOutput={aiOutput}
      />

      <TranscriptBottomSheet
        visible={showTranscript}
        onClose={() => setShowTranscript(false)}
        segments={meeting.transcript_segments}
        onSeek={handleSeekToTimestamp}
      />

      <AddTaskSheet
        visible={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onAdd={handleAddTask}
        isCreating={isCreating}
        meetingTitle={title}
      />

      <EditTaskSheet
        visible={!!editingTask}
        onClose={() => setEditingTask(null)}
        onUpdate={async (data: any) => {
          try {
            await updateTask(data);
            setEditingTask(null);
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          } catch (error) {
            console.error('[MeetingDetail] Error updating task:', error);
          }
        }}
        isUpdating={isUpdating}
        task={editingTask}
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
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 2,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textMuted,
  },
  headerEditButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  editMenuDropdown: {
    position: "absolute",
    top: 60,
    right: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 160,
  },
  editMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  editMenuItemText: {
    fontSize: 14,
    color: Colors.text,
  },
  content: {
    flex: 1,
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
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 12,
  },
  topicsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
    gap: 6,
  },
  topicChip: {
    backgroundColor: Colors.accentLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  topicChipText: {
    fontSize: 12,
    color: Colors.background,
    fontWeight: "500",
  },
  summaryText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  viewDetailsLink: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 4,
  },
  viewDetailsLinkText: {
    fontSize: 14,
    color: Colors.accentLight,
    fontWeight: "500",
  },
  noDataText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    paddingVertical: 16,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  actionCheckbox: {
    marginRight: 12,
    marginTop: 2,
  },
  actionContent: {
    flex: 1,
  },
  actionTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  actionTitle: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    lineHeight: 20,
  },
  actionTitleCompleted: {
    textDecorationLine: "line-through",
    color: Colors.textMuted,
  },
  actionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  actionMetaText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  actionButtons: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  actionEditButton: {
    padding: 4,
  },
  actionDeleteButton: {
    padding: 4,
  },
  billingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  billingIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.success}15`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  billingContent: {
    flex: 1,
  },
  billingLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  billingAmount: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.success,
    marginBottom: 2,
  },
  billingDetail: {
    fontSize: 11,
    color: Colors.textSecondary,
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
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${Colors.accentLight}15`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.accentLight,
  },
  // FAB Styles
  fabMain: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.accentLight,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  // Actions Sheet Styles
  actionsSheetContainer: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  actionsSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  actionsSheetContent: {
    paddingVertical: 8,
  },
  actionSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  actionSheetIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${Colors.accentLight}15`,
    justifyContent: "center",
    alignItems: "center",
  },
  actionSheetIconDanger: {
    backgroundColor: `${Colors.error}15`,
  },
  actionSheetTextContainer: {
    flex: 1,
  },
  actionSheetItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 2,
  },
  actionSheetItemTitleDanger: {
    color: Colors.error,
  },
  actionSheetItemDescription: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  actionSheetDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
    marginHorizontal: 20,
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
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingBottom: Platform.OS === "ios" ? 20 : 0,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
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
    borderBottomColor: Colors.border,
  },
  bottomSheetTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
  },
  bottomSheetClose: {
    padding: 4,
  },
  bottomSheetContent: {
    padding: 20,
  },
  insightSection: {
    marginBottom: 24,
  },
  insightSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 12,
  },
  insightItem: {
    marginBottom: 8,
  },
  insightItemText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  transcriptSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginVertical: 12,
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
  transcriptSegment: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  transcriptSegmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  transcriptSpeaker: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.accentLight,
  },
  transcriptTimestamp: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  transcriptSegmentText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 21,
  },
  highlightedText: {
    backgroundColor: `${Colors.accentLight}40`,
    color: Colors.text,
    fontWeight: "600",
  },
  // Quick Add Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  quickAddModalContent: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    width: "85%",
    maxWidth: 400,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  quickAddModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  quickAddModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
  },
  quickAddInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
    minHeight: 60,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  quickAddHelperText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 20,
    lineHeight: 16,
  },
  quickAddActions: {
    flexDirection: "row",
    gap: 12,
  },
  quickAddButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  quickAddCancelButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickAddCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
  },
  quickAddAddButton: {
    backgroundColor: Colors.accentLight,
  },
  quickAddAddButtonDisabled: {
    opacity: 0.5,
  },
  quickAddAddText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.background,
  },
  // Add Task Sheet Styles
  addTaskSheetContainer: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  addTaskContent: {
    paddingHorizontal: 20,
    maxHeight: 400,
  },
  taskInputContainer: {
    marginTop: 20,
    marginBottom: 20,
  },
  taskTitleInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: Colors.text,
    minHeight: 80,
    textAlignVertical: "top" as const,
  },
  optionRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionRowDisabled: {
    opacity: 0.5,
  },
  optionIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    marginRight: 12,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.text,
    marginBottom: 2,
  },
  optionLabelDisabled: {
    color: Colors.textMuted,
  },
  optionValue: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  optionValueActive: {
    color: Colors.accentLight,
    fontWeight: "500" as const,
  },
  optionValueDisabled: {
    color: Colors.textMuted,
  },
  optionChipsContainer: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  optionChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  optionChipActive: {
    backgroundColor: Colors.accentLight,
    borderColor: Colors.accentLight,
  },
  optionChipText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: "500" as const,
  },
  optionChipTextActive: {
    color: Colors.background,
    fontWeight: "600" as const,
  },
  addTaskFooter: {
    paddingHorizontal: 20,
    paddingTop: 16,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  addTaskButton: {
    backgroundColor: Colors.accentLight,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center" as const,
  },
  addTaskButtonDisabled: {
    opacity: 0.5,
  },
  addTaskButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.background,
  },
  selectedDateTimeContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: `${Colors.accentLight}15`,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  selectedDateTimeText: {
    fontSize: 13,
    color: Colors.accentLight,
    fontWeight: "600" as const,
  },
  datePickerOverlay: {
    flex: 1,
    justifyContent: "flex-end" as const,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  datePickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  datePickerContainer: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  datePickerHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  datePickerDoneButton: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.accentLight,
  },
  detailRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${Colors.accentLight}15`,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  billableToggleContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  billableToggleLabel: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: "500" as const,
  },
  billableToggleLabelActive: {
    color: Colors.text,
    fontWeight: "600" as const,
  },
  dropdownContainer: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: 200,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dropdownItemInfo: {
    flex: 1,
  },
  dropdownItemText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: "500" as const,
  },
  dropdownItemSubtext: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
