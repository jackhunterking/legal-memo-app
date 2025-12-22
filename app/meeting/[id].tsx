import { useState, useMemo } from "react";
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
} from "react-native";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronLeft,
  MoreVertical,
  FileText,
  ListChecks,
  DollarSign,
  Play,
  Pause,
  Edit3,
  Trash2,
  Download,
  AlertTriangle,
  Search,
  X,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetingDetails, useMeetings } from "@/contexts/MeetingContext";
import Colors from "@/constants/colors";

type TabKey = "summary" | "transcript" | "actions" | "billing";

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

  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [showMenu, setShowMenu] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const title = meeting?.title_override || meeting?.auto_title || "Meeting";
  const aiOutput = meeting?.ai_output;

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
    const query = searchQuery.toLowerCase();
    if (activeTab === "transcript") {
      return filteredTranscript.length;
    }
    if (activeTab === "summary" && aiOutput) {
      const summaryText = aiOutput.meeting_overview.one_sentence_summary.toLowerCase();
      return summaryText.includes(query) ? 1 : 0;
    }
    return 0;
  }, [searchQuery, activeTab, filteredTranscript, aiOutput]);

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

  const tabs: { key: TabKey; label: string; icon: typeof FileText }[] = [
    { key: "summary", label: "Summary", icon: FileText },
    { key: "transcript", label: "Transcript", icon: FileText },
    { key: "actions", label: "Actions", icon: ListChecks },
    { key: "billing", label: "Billing", icon: DollarSign },
  ];

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
          <Text style={styles.headerSubtitle}>
            {new Date(meeting.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.iconButton}
            onPress={() => router.push(`/edit-meeting?id=${id}` as any)}
          >
            <Edit3 size={20} color={Colors.text} />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => setShowMenu(!showMenu)}>
            <MoreVertical size={20} color={Colors.text} />
          </Pressable>
        </View>
      </View>

      {showMenu && (
        <View style={styles.menuDropdown}>
          <Pressable style={styles.menuItem} onPress={handleDelete}>
            <Trash2 size={18} color={Colors.error} />
            <Text style={[styles.menuItemText, { color: Colors.error }]}>Delete</Text>
          </Pressable>
          <Pressable style={styles.menuItem}>
            <Download size={18} color={Colors.text} />
            <Text style={styles.menuItemText}>Export</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.tabsContainer}>
        <View style={styles.tabs}>
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => {
                setActiveTab(tab.key);
                setSearchQuery("");
              }}
            >
              <Text
                style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {(activeTab === "summary" || activeTab === "transcript") && (
          <Pressable
            style={[styles.searchButton, showSearch && styles.searchButtonActive]}
            onPress={() => {
              setShowSearch(!showSearch);
              if (showSearch) setSearchQuery("");
            }}
          >
            <Search size={18} color={showSearch ? Colors.accentLight : Colors.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === "summary" && (
          <View style={styles.tabContent}>
            {showSearch && (
              <View style={styles.searchContainer}>
                <View style={styles.searchInputWrapper}>
                  <Search size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search summary..."
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
                    {matchCount} {matchCount === 1 ? "match" : "matches"} found
                  </Text>
                )}
              </View>
            )}

            <View style={styles.disclaimer}>
              <AlertTriangle size={14} color={Colors.warning} />
              <Text style={styles.disclaimerText}>
                AI-generated summary. Not legal advice.
              </Text>
            </View>

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
                <HighlightedText
                  text={aiOutput.meeting_overview.one_sentence_summary}
                  searchQuery={searchQuery}
                />
              </View>
            ) : (
              <View style={styles.noData}>
                <Text style={styles.noDataText}>
                  {meeting.status === "processing"
                    ? "Summary is being generated..."
                    : "No summary available"}
                </Text>
              </View>
            )}
          </View>
        )}

        {activeTab === "transcript" && (
          <View style={styles.tabContent}>
            {showSearch && (
              <View style={styles.searchContainer}>
                <View style={styles.searchInputWrapper}>
                  <Search size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search transcript..."
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
                    {matchCount} {matchCount === 1 ? "match" : "matches"} found
                  </Text>
                )}
              </View>
            )}

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
              <View style={styles.noData}>
                <Text style={styles.noDataText}>No matches found</Text>
              </View>
            ) : (
              <View style={styles.noData}>
                <Text style={styles.noDataText}>
                  {meeting.status === "processing"
                    ? "Transcript is being generated..."
                    : "No transcript available"}
                </Text>
              </View>
            )}
          </View>
        )}

        {activeTab === "actions" && (
          <View style={styles.tabContent}>
            {aiOutput?.follow_up_actions && aiOutput.follow_up_actions.length > 0 ? (
              aiOutput.follow_up_actions.map((action, index) => (
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
              ))
            ) : (
              <View style={styles.noData}>
                <Text style={styles.noDataText}>No action items found</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === "billing" && (
          <View style={styles.tabContent}>
            <View style={styles.billingCard}>
              <View style={styles.billingRow}>
                <Text style={styles.billingLabel}>Duration</Text>
                <Text style={styles.billingValue}>
                  {formatDuration(meeting.duration_seconds)}
                </Text>
              </View>
              <View style={styles.billingRow}>
                <Text style={styles.billingLabel}>Billable</Text>
                <Text style={styles.billingValue}>
                  {meeting.billable ? "Yes" : "No"}
                </Text>
              </View>
              {meeting.billable && (
                <>
                  <View style={styles.billingRow}>
                    <Text style={styles.billingLabel}>Billable Time</Text>
                    <Text style={styles.billingValue}>
                      {formatDuration(meeting.billable_seconds)}
                    </Text>
                  </View>
                  <View style={styles.billingRow}>
                    <Text style={styles.billingLabel}>Rate</Text>
                    <Text style={styles.billingValue}>
                      ${meeting.hourly_rate_snapshot}/hr
                    </Text>
                  </View>
                  <View style={[styles.billingRow, styles.billingTotal]}>
                    <Text style={styles.billingTotalLabel}>Total</Text>
                    <Text style={styles.billingTotalValue}>
                      {formatBillable(meeting.billable_seconds, meeting.hourly_rate_snapshot)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {meeting.audio_path && (
        <View style={styles.audioBar}>
          <Pressable
            style={styles.playButton}
            onPress={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <Pause size={20} color={Colors.text} fill={Colors.text} />
            ) : (
              <Play size={20} color={Colors.text} fill={Colors.text} />
            )}
          </Pressable>
          <View style={styles.audioProgress}>
            <View style={styles.audioProgressBar} />
          </View>
          <Text style={styles.audioTime}>
            {formatDuration(meeting.duration_seconds)}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  menuDropdown: {
    position: "absolute",
    top: 70,
    right: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  menuItemText: {
    fontSize: 15,
    color: Colors.text,
  },
  tabsContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingRight: 12,
  },
  tabs: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 16,
  },
  searchButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  searchButtonActive: {
    backgroundColor: `${Colors.accentLight}20`,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: Colors.accentLight,
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.text,
    fontWeight: "700" as const,
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${Colors.warning}15`,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  disclaimerText: {
    fontSize: 12,
    color: Colors.warning,
  },
  searchContainer: {
    marginBottom: 16,
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
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  topicsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 14,
    gap: 8,
  },
  topicTag: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  topicText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  noData: {
    alignItems: "center",
    paddingVertical: 48,
  },
  noDataText: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  transcriptSegment: {
    marginBottom: 16,
    paddingBottom: 16,
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
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    marginRight: 12,
    marginTop: 2,
  },
  actionCheckboxChecked: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  actionContent: {
    flex: 1,
  },
  actionText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  actionTextCompleted: {
    textDecorationLine: "line-through",
    color: Colors.textMuted,
  },
  actionMeta: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  actionOwner: {
    fontSize: 12,
    color: Colors.accentLight,
    fontWeight: "500" as const,
  },
  actionDeadline: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  billingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  billingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  billingLabel: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  billingValue: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  billingTotal: {
    borderBottomWidth: 0,
    marginTop: 8,
  },
  billingTotalLabel: {
    fontSize: 17,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  billingTotalValue: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: Colors.success,
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
  audioProgress: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 2,
  },
  audioProgressBar: {
    width: "30%",
    height: "100%",
    backgroundColor: Colors.accentLight,
    borderRadius: 2,
  },
  audioTime: {
    fontSize: 13,
    color: Colors.textMuted,
    minWidth: 50,
    textAlign: "right",
  },
});
