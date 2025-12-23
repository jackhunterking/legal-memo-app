import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, X, Clock, ChevronRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetings } from "@/contexts/MeetingContext";
import Colors from "@/constants/colors";
import type { Meeting } from "@/types";
import { formatDuration } from "@/types";

export default function SearchScreen() {
  const router = useRouter();
  const { meetings } = useMeetings();
  const [query, setQuery] = useState("");

  const filteredMeetings = useCallback(() => {
    if (!query.trim()) return [];
    
    const searchTerm = query.toLowerCase();
    return meetings.filter((meeting) => {
      const title = meeting.title.toLowerCase();
      return title.includes(searchTerm);
    });
  }, [query, meetings]);

  const handleMeetingPress = (meeting: Meeting) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(`/meeting/${meeting.id}`);
  };

  const handleClose = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  };

  const results = filteredMeetings();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Search size={20} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search meetings..."
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")}>
              <X size={20} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable style={styles.cancelButton} onPress={handleClose}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>

      {query.trim() === "" ? (
        <View style={styles.emptyState}>
          <Search size={48} color={Colors.surfaceLight} />
          <Text style={styles.emptyTitle}>Search Meetings</Text>
          <Text style={styles.emptySubtitle}>
            Search by meeting title
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Results</Text>
          <Text style={styles.emptySubtitle}>
            No meetings found matching your search
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.resultsList}
          renderItem={({ item }) => {
            const date = new Date(item.created_at);
            
            return (
              <Pressable
                style={styles.resultItem}
                onPress={() => handleMeetingPress(item)}
              >
                <View style={styles.resultIcon}>
                  <Clock size={20} color={Colors.textMuted} />
                </View>
                <View style={styles.resultContent}>
                  <Text style={styles.resultTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.resultMeta}>
                    {date.toLocaleDateString()} • {formatDuration(item.duration_seconds)}
                  </Text>
                </View>
                <ChevronRight size={20} color={Colors.textMuted} />
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 16,
    color: Colors.accentLight,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600" as const,
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
  },
  resultsList: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  resultContent: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.text,
    marginBottom: 4,
  },
  resultMeta: {
    fontSize: 13,
    color: Colors.textMuted,
  },
});
