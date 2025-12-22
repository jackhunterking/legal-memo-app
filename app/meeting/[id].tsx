import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
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
  ChevronDown,
  ChevronUp,
  Edit3,
  Trash2,
  Download,
  AlertTriangle,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetingDetails, useMeetings } from "@/contexts/MeetingContext";
import Colors from "@/constants/colors";
import type { Certainty } from "@/types";

type TabKey = "summary" | "transcript" | "actions" | "billing";

interface SummaryItem {
  text: string;
  support: { start_ms: number; end_ms: number }[];
  certainty: Certainty;
}

const CertaintyBadge = ({ certainty }: { certainty: Certainty }) => (
  <View
    style={[
      styles.certaintyBadge,
      {
        backgroundColor:
          certainty === "explicit"
            ? `${Colors.certaintyExplicit}20`
            : `${Colors.certaintyUnclear}20`,
      },
    ]}
  >
    <Text
      style={[
        styles.certaintyText,
        {
          color:
            certainty === "explicit"
              ? Colors.certaintyExplicit
              : Colors.certaintyUnclear,
        },
      ]}
    >
      {certainty}
    </Text>
  </View>
);

const SummarySection = ({
  title,
  items,
  isExpanded,
  onToggle,
}: {
  title: string;
  items: SummaryItem[];
  isExpanded: boolean;
  onToggle: () => void;
}) => (
  <View style={styles.summarySection}>
    <Pressable style={styles.sectionHeader} onPress={onToggle}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionHeaderRight}>
        <Text style={styles.sectionCount}>{items.length}</Text>
        {isExpanded ? (
          <ChevronUp size={20} color={Colors.textMuted} />
        ) : (
          <ChevronDown size={20} color={Colors.textMuted} />
        )}
      </View>
    </Pressable>
    {isExpanded && (
      <View style={styles.sectionContent}>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>No items found</Text>
        ) : (
          items.map((item, index) => (
            <View key={index} style={styles.summaryItem}>
              <Text style={styles.summaryItemText}>{item.text}</Text>
              <CertaintyBadge certainty={item.certainty} />
            </View>
          ))
        )}
      </View>
    )}
  </View>
);

export default function MeetingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: meeting, isLoading } = useMeetingDetails(id || null);
  const { deleteMeeting } = useMeetings();

  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    key_facts: false,
    legal_issues: false,
    decisions: false,
    risks: false,
    follow_up: false,
    open_questions: false,
  });
  const [showMenu, setShowMenu] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const toggleSection = (key: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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

  const title = meeting?.title_override || meeting?.auto_title || "Meeting";
  const aiOutput = meeting?.ai_output;

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

      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === "summary" && (
          <View style={styles.tabContent}>
            <View style={styles.disclaimer}>
              <AlertTriangle size={14} color={Colors.warning} />
              <Text style={styles.disclaimerText}>
                AI-generated summary. Not legal advice.
              </Text>
            </View>

            {aiOutput ? (
              <>
                <View style={styles.overviewCard}>
                  <Text style={styles.overviewText}>
                    {aiOutput.meeting_overview.one_sentence_summary}
                  </Text>
                  {aiOutput.meeting_overview.topics.length > 0 && (
                    <View style={styles.topicsRow}>
                      {aiOutput.meeting_overview.topics.map((topic, i) => (
                        <View key={i} style={styles.topicTag}>
                          <Text style={styles.topicText}>{topic}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                <SummarySection
                  title="Key Facts"
                  items={aiOutput.key_facts_stated.map((f) => ({
                    text: f.fact,
                    support: f.support,
                    certainty: f.certainty,
                  })) as { text: string; support: { start_ms: number; end_ms: number }[]; certainty: Certainty }[]}
                  isExpanded={expandedSections.key_facts}
                  onToggle={() => toggleSection("key_facts")}
                />

                <SummarySection
                  title="Legal Issues"
                  items={aiOutput.legal_issues_discussed.map((item) => ({
                    text: item.issue,
                    support: item.support,
                    certainty: item.certainty,
                  })) as { text: string; support: { start_ms: number; end_ms: number }[]; certainty: Certainty }[]}
                  isExpanded={expandedSections.legal_issues}
                  onToggle={() => toggleSection("legal_issues")}
                />

                <SummarySection
                  title="Decisions Made"
                  items={aiOutput.decisions_made.map((d) => ({
                    text: d.decision,
                    support: d.support,
                    certainty: d.certainty,
                  })) as { text: string; support: { start_ms: number; end_ms: number }[]; certainty: Certainty }[]}
                  isExpanded={expandedSections.decisions}
                  onToggle={() => toggleSection("decisions")}
                />

                <SummarySection
                  title="Risks & Concerns"
                  items={aiOutput.risks_or_concerns_raised.map((r) => ({
                    text: r.risk,
                    support: r.support,
                    certainty: r.certainty,
                  })) as { text: string; support: { start_ms: number; end_ms: number }[]; certainty: Certainty }[]}
                  isExpanded={expandedSections.risks}
                  onToggle={() => toggleSection("risks")}
                />

                <SummarySection
                  title="Open Questions"
                  items={aiOutput.open_questions.map((q) => ({
                    text: q.question,
                    support: q.support,
                    certainty: q.certainty,
                  })) as { text: string; support: { start_ms: number; end_ms: number }[]; certainty: Certainty }[]}
                  isExpanded={expandedSections.open_questions}
                  onToggle={() => toggleSection("open_questions")}
                />
              </>
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
            {meeting.transcript_segments && meeting.transcript_segments.length > 0 ? (
              meeting.transcript_segments.map((segment, index) => (
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
                  <Text style={styles.segmentText}>{segment.text}</Text>
                </View>
              ))
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
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
  overviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  overviewText: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
  },
  topicsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
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
  summarySection: {
    marginBottom: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  sectionHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionCount: {
    fontSize: 13,
    color: Colors.textMuted,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  summaryItemText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  certaintyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  certaintyText: {
    fontSize: 10,
    fontWeight: "600" as const,
    textTransform: "uppercase",
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontStyle: "italic",
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
