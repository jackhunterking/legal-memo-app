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
} from "react-native";
import { Audio, AVPlaybackStatus } from "expo-av";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronLeft,
  MoreVertical,
  Play,
  Pause,
  Edit3,
  Trash2,
  AlertTriangle,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  Plus,
  CheckCircle2,
  Circle,
  Bell,
  Calendar,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetingDetails, useMeetings } from "@/contexts/MeetingContext";
import { useTasks, useMeetingTasks } from "@/contexts/TaskContext";
import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HighlightedText = ({ text, searchQuery }: { text: string; searchQuery: string }) => {
  if (!searchQuery.trim()) {
    return <Text style={styles.segmentText}>{text}</Text>;
  }

  const parts = text.split(new RegExp(`(${escapeRegex(searchQuery)})`, "gi"));

  return (
    <Text style={styles.segmentText}>
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

export default function MeetingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: meeting, isLoading } = useMeetingDetails(id || null);
  const { deleteMeeting } = useMeetings();
  const { data: tasks = [], isLoading: tasksLoading } = useMeetingTasks(id || null);
  const { createTask, updateTask, deleteTask, isCreating } = useTasks();

  const [showMenu, setShowMenu] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [expandedSummary, setExpandedSummary] = useState(true);
  const [expandedTranscript, setExpandedTranscript] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState(true);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newTaskOwner, setNewTaskOwner] = useState("");
  const [newTaskReminderDate, setNewTaskReminderDate] = useState("");

  const soundRef = useRef<Audio.Sound | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const progressBarRef = useRef<View>(null);
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  const title = meeting?.title_override || meeting?.auto_title || "Meeting";
  const aiOutput = meeting?.ai_output;

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        console.error('[AudioPlayer] Playback error:', status.error);
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
      console.log('[AudioPlayer] Loading audio from:', meeting.audio_path);

      const { data } = supabase.storage
        .from('recordings')
        .getPublicUrl(meeting.audio_path);

      if (!data?.publicUrl) {
        console.error('[AudioPlayer] No public URL found');
        return;
      }

      console.log('[AudioPlayer] Audio URL:', data.publicUrl);

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: data.publicUrl },
        { shouldPlay: false, progressUpdateIntervalMillis: 100 },
        onPlaybackStatusUpdate
      );

      soundRef.current = sound;
      console.log('[AudioPlayer] Audio loaded successfully');
    } catch (error) {
      console.error('[AudioPlayer] Error loading audio:', error);
    } finally {
      setIsAudioLoading(false);
    }
  }, [meeting?.audio_path, onPlaybackStatusUpdate]);

  useEffect(() => {
    if (meeting?.audio_path) {
      loadAudio();
    }

    return () => {
      if (soundRef.current) {
        console.log('[AudioPlayer] Unloading sound');
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, [meeting?.audio_path, loadAudio]);

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
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.error('[AudioPlayer] Play/pause error:', error);
    }
  };

  const handleSeek = async (event: { nativeEvent: { locationX: number } }) => {
    if (!soundRef.current || !durationMillis || !progressBarWidth) return;

    const x = event.nativeEvent.locationX;
    const percentage = Math.max(0, Math.min(1, x / progressBarWidth));
    const seekPosition = percentage * durationMillis;

    try {
      await soundRef.current.setPositionAsync(seekPosition);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.error('[AudioPlayer] Seek error:', error);
    }
  };

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progress = durationMillis > 0 ? (positionMillis / durationMillis) * 100 : 0;

  const filteredTranscript = useMemo(() => {
    if (!meeting?.transcript_segments || !searchQuery.trim()) {
      return meeting?.transcript_segments || [];
    }
    const query = searchQuery.toLowerCase();
    return meeting.transcript_segments.filter(
      (segment) =>
        segment.text.toLowerCase().includes(query) ||
        (segment.speaker_name || segment.speaker_label).toLowerCase().includes(query)
    );
  }, [meeting?.transcript_segments, searchQuery]);

  const matchCount = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    return filteredTranscript.length;
  }, [searchQuery, filteredTranscript]);

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

  const handleToggleAction = async (actionIndex: number, completed: boolean) => {
    if (!id || !meeting?.ai_output) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const updatedActions = [...meeting.ai_output.follow_up_actions];
    updatedActions[actionIndex] = { ...updatedActions[actionIndex], completed };
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      await updateTask({ taskId, updates: { completed } });
    } catch (error) {
      console.error('[MeetingDetail] Error toggling task:', error);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    const performDelete = async () => {
      try {
        await deleteTask(taskId);
      } catch (error) {
        console.error('[MeetingDetail] Error deleting task:', error);
      }
    };

    if (Platform.OS === "web") {
      if (confirm("Delete this task?")) {
        performDelete();
      }
    } else {
      Alert.alert(
        "Delete Task",
        "Are you sure you want to delete this task?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: performDelete },
        ]
      );
    }
  };

  const handleAddTask = async () => {
    if (!id || !newTaskTitle.trim()) return;

    try {
      await createTask({
        meeting_id: id,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || null,
        priority: newTaskPriority,
        owner: newTaskOwner.trim() || null,
        reminder_time: newTaskReminderDate || null,
      });

      setShowAddTaskModal(false);
      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskPriority('medium');
      setNewTaskOwner("");
      setNewTaskReminderDate("");

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('[MeetingDetail] Error adding task:', error);
    }
  };

  const getPriorityColor = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return Colors.error;
      case 'medium': return Colors.warning;
      case 'low': return Colors.success;
      default: return Colors.textMuted;
    }
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

  if (isLoading || !meeting) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accentLight} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

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
        <View style={styles.headerActions}>
          <Pressable
            style={styles.iconButton}
            onPress={() => {
              setShowSearch(!showSearch);
              if (showSearch) setSearchQuery("");
            }}
          >
            <Search size={18} color={showSearch ? Colors.accentLight : Colors.text} />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => setShowMenu(!showMenu)}>
            <MoreVertical size={18} color={Colors.text} />
          </Pressable>
        </View>
      </View>

      {showMenu && (
        <View style={styles.menuDropdown}>
          <Pressable
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              router.push(`/edit-meeting?id=${id}` as any);
            }}
          >
            <Edit3 size={18} color={Colors.text} />
            <Text style={styles.menuItemText}>Edit Meeting</Text>
          </Pressable>
          <Pressable style={styles.menuItem} onPress={handleDelete}>
            <Trash2 size={18} color={Colors.error} />
            <Text style={[styles.menuItemText, { color: Colors.error }]}>Delete</Text>
          </Pressable>
        </View>
      )}

      {showSearch && (
        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrapper}>
            <Search size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search in transcript..."
              placeholderTextColor={Colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")}>
                <X size={18} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>
          {searchQuery.length > 0 && (
            <Text style={styles.searchResultCount}>
              {matchCount} {matchCount === 1 ? "result" : "results"}
            </Text>
          )}
        </View>
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.disclaimer}>
          <AlertTriangle size={12} color={Colors.warning} />
          <Text style={styles.disclaimerText}>
            AI-generated content. Not legal advice.
          </Text>
        </View>

        <Pressable
          style={styles.sectionHeader}
          onPress={() => setExpandedSummary(!expandedSummary)}
        >
          <Text style={styles.sectionTitle}>Summary</Text>
          {expandedSummary ? (
            <ChevronUp size={20} color={Colors.text} />
          ) : (
            <ChevronDown size={20} color={Colors.text} />
          )}
        </Pressable>

        {expandedSummary && (
          <View style={styles.sectionContent}>
            {aiOutput ? (
              <View style={styles.summaryCard}>
                {aiOutput.meeting_overview.topics.length > 0 && (
                  <View style={styles.topicsRow}>
                    {aiOutput.meeting_overview.topics.map((topic, i) => (
                      <View key={i} style={styles.topicTag}>
                        <Text style={styles.topicText}>{topic}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={styles.summaryText}>
                  {aiOutput.meeting_overview.one_sentence_summary}
                </Text>
              </View>
            ) : (
              <Text style={styles.noDataText}>
                {meeting.status === "processing"
                  ? "Summary is being generated..."
                  : "No summary available"}
              </Text>
            )}
          </View>
        )}

        <Pressable
          style={styles.sectionHeader}
          onPress={() => setExpandedTasks(!expandedTasks)}
        >
          <Text style={styles.sectionTitle}>Tasks ({tasks.length})</Text>
          <View style={styles.taskHeaderActions}>
            <Pressable
              style={styles.addTaskButton}
              onPress={(e) => {
                e.stopPropagation();
                setShowAddTaskModal(true);
              }}
            >
              <Plus size={16} color={Colors.accentLight} />
            </Pressable>
            {expandedTasks ? (
              <ChevronUp size={20} color={Colors.text} />
            ) : (
              <ChevronDown size={20} color={Colors.text} />
            )}
          </View>
        </Pressable>

        {expandedTasks && (
          <View style={styles.sectionContent}>
            {tasksLoading ? (
              <ActivityIndicator size="small" color={Colors.accentLight} />
            ) : tasks.length > 0 ? (
              tasks.map((task) => (
                <View key={task.id} style={styles.taskItem}>
                  <Pressable
                    style={styles.taskCheckbox}
                    onPress={() => handleToggleTask(task.id, !task.completed)}
                  >
                    {task.completed ? (
                      <CheckCircle2 size={20} color={Colors.success} fill={Colors.success} />
                    ) : (
                      <Circle size={20} color={Colors.border} />
                    )}
                  </Pressable>
                  <View style={styles.taskContent}>
                    <View style={styles.taskHeader}>
                      <Text
                        style={[
                          styles.taskTitle,
                          task.completed && styles.taskTitleCompleted,
                        ]}
                      >
                        {task.title}
                      </Text>
                      <View
                        style={[
                          styles.priorityBadge,
                          { backgroundColor: `${getPriorityColor(task.priority)}20` },
                        ]}
                      >
                        <Text
                          style={[
                            styles.priorityText,
                            { color: getPriorityColor(task.priority) },
                          ]}
                        >
                          {task.priority}
                        </Text>
                      </View>
                    </View>
                    {task.description && (
                      <Text style={styles.taskDescription}>{task.description}</Text>
                    )}
                    <View style={styles.taskMeta}>
                      {task.owner && (
                        <View style={styles.taskMetaItem}>
                          <Text style={styles.taskMetaText}>{task.owner}</Text>
                        </View>
                      )}
                      {task.reminder_time && (
                        <View style={styles.taskMetaItem}>
                          <Bell size={10} color={Colors.textMuted} />
                          <Text style={styles.taskMetaText}>
                            {new Date(task.reminder_time).toLocaleDateString()}
                          </Text>
                        </View>
                      )}
                      <Pressable
                        style={styles.deleteTaskButton}
                        onPress={() => handleDeleteTask(task.id)}
                      >
                        <Trash2 size={12} color={Colors.error} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.noDataText}>
                {meeting.status === "processing"
                  ? "Tasks are being generated..."
                  : "No tasks yet. Tap + to add one."}
              </Text>
            )}
          </View>
        )}

        {aiOutput?.follow_up_actions && aiOutput.follow_up_actions.length > 0 && (
          <View style={styles.actionsList}>
            <Text style={styles.sectionTitleStatic}>Action Items</Text>
            {aiOutput.follow_up_actions.map((action, index) => (
              <Pressable
                key={index}
                style={styles.actionItem}
                onPress={() => handleToggleAction(index, !action.completed)}
              >
                <View
                  style={[
                    styles.actionCheckbox,
                    action.completed && styles.actionCheckboxChecked,
                  ]}
                />
                <View style={styles.actionContent}>
                  <Text
                    style={[
                      styles.actionText,
                      action.completed && styles.actionTextCompleted,
                    ]}
                  >
                    {action.action}
                  </Text>
                  <View style={styles.actionMeta}>
                    <Text style={styles.actionOwner}>{action.owner}</Text>
                    {action.deadline && (
                      <Text style={styles.actionDeadline}>Due: {action.deadline}</Text>
                    )}
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {meeting.billable && (
          <View style={styles.billingSection}>
            <View style={styles.billingSummary}>
              <View style={styles.billingIconWrapper}>
                <DollarSign size={16} color={Colors.success} />
              </View>
              <View style={styles.billingInfo}>
                <Text style={styles.billingSummaryLabel}>Billable Amount</Text>
                <Text style={styles.billingSummaryValue}>
                  {formatBillable(meeting.billable_seconds, meeting.hourly_rate_snapshot)}
                </Text>
              </View>
              <View style={styles.billingDetail}>
                <Text style={styles.billingDetailText}>
                  {formatDuration(meeting.billable_seconds)} @ ${meeting.hourly_rate_snapshot}/hr
                </Text>
              </View>
            </View>
          </View>
        )}

        <Pressable
          style={styles.sectionHeader}
          onPress={() => setExpandedTranscript(!expandedTranscript)}
        >
          <Text style={styles.sectionTitle}>Transcript</Text>
          {expandedTranscript ? (
            <ChevronUp size={20} color={Colors.text} />
          ) : (
            <ChevronDown size={20} color={Colors.text} />
          )}
        </Pressable>

        {expandedTranscript && (
          <View style={styles.sectionContent}>
            {filteredTranscript.length > 0 ? (
              filteredTranscript.map((segment, index) => (
                <View key={segment.id || index} style={styles.transcriptSegment}>
                  <View style={styles.segmentHeader}>
                    <Text style={styles.speakerLabel}>
                      {segment.speaker_name || segment.speaker_label}
                    </Text>
                    <Text style={styles.timestamp}>
                      {Math.floor(segment.start_ms / 60000)}:
                      {((segment.start_ms % 60000) / 1000).toFixed(0).padStart(2, "0")}
                    </Text>
                  </View>
                  <HighlightedText text={segment.text} searchQuery={searchQuery} />
                </View>
              ))
            ) : searchQuery.trim() &&
              meeting.transcript_segments &&
              meeting.transcript_segments.length > 0 ? (
              <Text style={styles.noDataText}>No matches found</Text>
            ) : (
              <Text style={styles.noDataText}>
                {meeting.status === "processing"
                  ? "Transcript is being generated..."
                  : "No transcript available"}
              </Text>
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <Modal
        visible={showAddTaskModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddTaskModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Task</Text>
              <Pressable onPress={() => setShowAddTaskModal(false)}>
                <X size={24} color={Colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="Task title"
                placeholderTextColor={Colors.textMuted}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                autoFocus
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Task description"
                placeholderTextColor={Colors.textMuted}
                value={newTaskDescription}
                onChangeText={setNewTaskDescription}
                multiline
                numberOfLines={3}
              />

              <Text style={styles.inputLabel}>Priority</Text>
              <View style={styles.prioritySelector}>
                {(['low', 'medium', 'high'] as const).map((priority) => (
                  <Pressable
                    key={priority}
                    style={[
                      styles.priorityOption,
                      newTaskPriority === priority && styles.priorityOptionActive,
                      { borderColor: getPriorityColor(priority) },
                    ]}
                    onPress={() => setNewTaskPriority(priority)}
                  >
                    <Text
                      style={[
                        styles.priorityOptionText,
                        newTaskPriority === priority && {
                          color: getPriorityColor(priority),
                          fontWeight: '600' as const,
                        },
                      ]}
                    >
                      {priority}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Owner</Text>
              <TextInput
                style={styles.input}
                placeholder="Who's responsible?"
                placeholderTextColor={Colors.textMuted}
                value={newTaskOwner}
                onChangeText={setNewTaskOwner}
              />

              <Text style={styles.inputLabel}>Reminder Date (Optional)</Text>
              <View style={styles.reminderInput}>
                <Calendar size={16} color={Colors.textMuted} />
                <TextInput
                  style={styles.reminderTextInput}
                  placeholder="YYYY-MM-DD HH:MM"
                  placeholderTextColor={Colors.textMuted}
                  value={newTaskReminderDate}
                  onChangeText={setNewTaskReminderDate}
                />
              </View>
              <Text style={styles.helpText}>
                Format: 2025-12-31 14:30 (for reminder notification)
              </Text>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowAddTaskModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.saveButton, !newTaskTitle.trim() && styles.saveButtonDisabled]}
                onPress={handleAddTask}
                disabled={!newTaskTitle.trim() || isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <Text style={styles.saveButtonText}>Add Task</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {meeting.audio_path && (
        <View style={styles.audioBar}>
          <Pressable
            style={styles.playButton}
            onPress={handlePlayPause}
            disabled={isAudioLoading}
          >
            {isAudioLoading ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : isPlaying ? (
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
              ref={progressBarRef}
              style={styles.audioProgress}
              onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
            >
              <View style={[styles.audioProgressBar, { width: `${progress}%` }]} />
              <View style={[styles.audioProgressThumb, { left: `${progress}%` }]} />
            </View>
          </Pressable>

          <Text style={styles.audioTime}>
            {formatTime(positionMillis)} / {formatTime(durationMillis || (meeting.duration_seconds * 1000))}
          </Text>
        </View>
      )}
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
    fontWeight: "600" as const,
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
  headerActions: {
    flexDirection: "row",
    gap: 4,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  menuDropdown: {
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
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  menuItemText: {
    fontSize: 14,
    color: Colors.text,
  },
  content: {
    flex: 1,
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${Colors.warning}10`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    borderRadius: 6,
    gap: 6,
  },
  disclaimerText: {
    fontSize: 11,
    color: Colors.warning,
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    padding: 0,
  },
  searchResultCount: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 8,
    marginLeft: 4,
  },
  highlightedText: {
    backgroundColor: `${Colors.accentLight}40`,
    color: Colors.text,
    fontWeight: "600" as const,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  sectionTitleStatic: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.text,
    marginBottom: 12,
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  summaryCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 14,
  },
  summaryText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  topicsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
    gap: 6,
  },
  topicTag: {
    backgroundColor: Colors.accentLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  topicText: {
    fontSize: 11,
    color: Colors.background,
    fontWeight: "500" as const,
  },
  noDataText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    paddingVertical: 24,
  },
  transcriptSegment: {
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  segmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  speakerLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.accentLight,
  },
  timestamp: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  segmentText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 21,
  },
  actionsList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    marginRight: 10,
    marginTop: 1,
  },
  actionCheckboxChecked: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  actionContent: {
    flex: 1,
  },
  actionText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  actionTextCompleted: {
    textDecorationLine: "line-through",
    color: Colors.textMuted,
  },
  actionMeta: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  actionOwner: {
    fontSize: 11,
    color: Colors.accentLight,
    fontWeight: "500" as const,
  },
  actionDeadline: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  billingSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  billingSummary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  billingIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.success}15`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  billingInfo: {
    flex: 1,
  },
  billingSummaryLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  billingSummaryValue: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.success,
  },
  billingDetail: {
    alignItems: "flex-end",
  },
  billingDetailText: {
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
    justifyContent: 'center',
  },
  audioProgress: {
    height: 4,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 2,
    position: 'relative',
  },
  audioProgressBar: {
    height: '100%',
    backgroundColor: Colors.accentLight,
    borderRadius: 2,
  },
  audioProgressThumb: {
    position: 'absolute',
    top: -4,
    marginLeft: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accentLight,
  },
  audioTime: {
    fontSize: 12,
    color: Colors.textMuted,
    minWidth: 80,
    textAlign: 'right',
  },
  taskHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addTaskButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${Colors.accentLight}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  taskCheckbox: {
    marginRight: 12,
    marginTop: 2,
  },
  taskContent: {
    flex: 1,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  taskDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  taskMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  taskMetaText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  deleteTaskButton: {
    marginLeft: 'auto',
    padding: 4,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600' as const,
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  modalForm: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  prioritySelector: {
    flexDirection: 'row',
    gap: 10,
  },
  priorityOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  priorityOptionActive: {
    backgroundColor: Colors.surfaceLight,
  },
  priorityOptionText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.textMuted,
    textTransform: 'capitalize',
  },
  reminderInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  reminderTextInput: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
  },
  helpText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  saveButton: {
    backgroundColor: Colors.accentLight,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.background,
  },
});
