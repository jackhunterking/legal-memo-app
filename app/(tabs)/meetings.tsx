import { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, Clock, AlertCircle, CheckCircle, Loader } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetings } from "@/contexts/MeetingContext";
import type { Meeting, MeetingStatus } from "@/types";
import { getStatusInfo, formatDuration } from "@/types";
import Colors from "@/constants/colors";

// Status indicator component
const StatusIndicator = ({ status }: { status: MeetingStatus }) => {
  const statusInfo = getStatusInfo(status);
  
  if (status === 'ready') {
    return <CheckCircle size={16} color={Colors.success} />;
  }
  if (status === 'failed') {
    return <AlertCircle size={16} color={Colors.error} />;
  }
  // Processing states
  return <Loader size={16} color={Colors.accentLight} />;
};

const MeetingCard = ({ meeting, onPress }: { meeting: Meeting; onPress: () => void }) => {
  const date = new Date(meeting.created_at);
  const statusInfo = getStatusInfo(meeting.status);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {meeting.title}
          </Text>
          <StatusIndicator status={meeting.status} />
        </View>
      </View>
      
      <View style={styles.cardMeta}>
        <Text style={styles.cardDate}>
          {date.toLocaleDateString()} • {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
        {meeting.duration_seconds > 0 && (
          <View style={styles.durationContainer}>
            <Clock size={12} color={Colors.textMuted} />
            <Text style={styles.durationText}>{formatDuration(meeting.duration_seconds)}</Text>
          </View>
        )}
      </View>
      
      {meeting.status !== 'ready' && (
        <View style={[styles.statusBadge, { backgroundColor: `${statusInfo.color}20` }]}>
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            {statusInfo.label}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

export default function MeetingsScreen() {
  const router = useRouter();
  const { meetings, isLoading } = useMeetings();
  const [searchQuery, setSearchQuery] = useState("");

  const handleMeetingPress = (meeting: Meeting) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(`/meeting/${meeting.id}`);
  };

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      // Don't show meetings that are still uploading
      if (m.status === "uploading") return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const title = m.title.toLowerCase();
        if (!title.includes(query)) return false;
      }

      return true;
    });
  }, [meetings, searchQuery]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Meetings</Text>
      </View>

      <View style={styles.searchContainer}>
        <Search size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search meetings..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

        <FlatList
          data={filteredMeetings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MeetingCard meeting={item} onPress={() => handleMeetingPress(item)} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
              {isLoading ? "Loading meetings..." : "No meetings found"}
            </Text>
            {!isLoading && (
              <Text style={styles.emptyHint}>
                Start a new recording from the Home tab
              </Text>
            )}
              </View>
            }
          />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.text,
    letterSpacing: -0.5,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 24,
    marginBottom: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  list: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: Colors.text,
    letterSpacing: -0.2,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardDate: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  durationContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  durationText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
  },
});
