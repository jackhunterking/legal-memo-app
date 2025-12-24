import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Platform,
  RefreshControl,
  Animated,
  Easing,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, Clock, AlertCircle, CheckCircle, Loader, DollarSign } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetings } from "@/contexts/MeetingContext";
import { useAuth } from "@/contexts/AuthContext";
import type { MeetingWithContact, MeetingStatus, MeetingType } from "@/types";
import { getStatusInfo, formatDuration, formatCurrency } from "@/types";
import Colors from "@/constants/colors";

// Circular loading indicator component
const SyncIndicator = ({ visible }: { visible: boolean }) => {
  const spinValue = useRef(new Animated.Value(0)).current;
  const fadeValue = useRef(new Animated.Value(0)).current;
  const heightValue = useRef(new Animated.Value(0)).current;
  const spinAnimation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (visible) {
      // Expand height and fade in
      Animated.parallel([
        Animated.timing(heightValue, {
          toValue: 60,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(fadeValue, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Start spinning
      spinAnimation.current = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinAnimation.current.start();
    } else {
      // Collapse height and fade out
      Animated.parallel([
        Animated.timing(fadeValue, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(heightValue, {
          toValue: 0,
          duration: 250,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();

      // Stop spinning
      if (spinAnimation.current) {
        spinAnimation.current.stop();
      }
      spinValue.setValue(0);
    }
  }, [visible]);

  const rotation = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[styles.syncContainer, { height: heightValue }]}>
      <Animated.View style={[styles.syncContent, { opacity: fadeValue }]}>
        <View style={styles.spinnerOuter}>
          <Animated.View 
            style={[
              styles.spinnerInner,
              { transform: [{ rotate: rotation }] }
            ]}
          >
            <View style={styles.spinnerArc} />
          </Animated.View>
        </View>
        <Text style={styles.syncText}>Syncing your meetings...</Text>
      </Animated.View>
    </Animated.View>
  );
};

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

const MeetingCard = ({ 
  meeting, 
  onPress,
  meetingType,
  currencySymbol = '$',
}: { 
  meeting: MeetingWithContact; 
  onPress: () => void;
  meetingType?: MeetingType;
  currencySymbol?: string;
}) => {
  const date = new Date(meeting.created_at);
  const statusInfo = getStatusInfo(meeting.status);
  
  // Get contact name if available
  const contactName = meeting.contact 
    ? `${meeting.contact.first_name}${meeting.contact.last_name ? ' ' + meeting.contact.last_name : ''}`
    : null;
  
  // Get contact category if available
  const contactCategory = meeting.contact?.category;

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
      
      <View style={styles.cardFooter}>
        {/* Billable Badge - show amount if billable */}
        {meeting.is_billable && meeting.billable_amount && (
          <View style={styles.billableBadge}>
            <DollarSign size={10} color={Colors.success} />
            <Text style={styles.billableText}>
              {formatCurrency(meeting.billable_amount, currencySymbol)}
            </Text>
          </View>
        )}
        
        {/* Contact Name Badge - Neutral Colors for Better Contrast */}
        {contactName && (
          <View style={styles.contactBadge}>
            <Text style={styles.contactText}>
              {contactName}
            </Text>
          </View>
        )}
        
        {/* Contact Category Badge - Colorized */}
        {contactCategory && (
          <View style={[styles.categoryBadge, { backgroundColor: contactCategory.color + "20" }]}>
            <View style={[styles.categoryDot, { backgroundColor: contactCategory.color }]} />
            <Text style={[styles.categoryText, { color: contactCategory.color }]}>
              {contactCategory.name}
            </Text>
          </View>
        )}
        
        {/* Meeting Type Badge */}
        {meetingType && (
          <View style={[styles.typeBadge, { backgroundColor: meetingType.color + "20" }]}>
            <View style={[styles.typeDot, { backgroundColor: meetingType.color }]} />
            <Text style={[styles.typeText, { color: meetingType.color }]}>
              {meetingType.name}
            </Text>
          </View>
        )}
        
        {/* Status Badge - only show when not ready */}
        {meeting.status !== 'ready' && (
          <View style={[styles.statusBadge, { backgroundColor: `${statusInfo.color}20` }]}>
            <Text style={[styles.statusText, { color: statusInfo.color }]}>
              {statusInfo.label}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
};

export default function MeetingsScreen() {
  const router = useRouter();
  const { meetings, isLoading, isRefreshing, refetchMeetings, meetingTypes } = useMeetings();
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSyncIndicator, setShowSyncIndicator] = useState(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Currency symbol from user profile
  const currencySymbol = profile?.currency_symbol || '$';

  // Create a map of meeting types by ID for quick lookup
  const meetingTypesMap = useMemo(() => {
    const map = new Map<string, MeetingType>();
    meetingTypes.forEach((type) => map.set(type.id, type));
    return map;
  }, [meetingTypes]);

  // Handle sync indicator visibility (minimum 1.5 seconds)
  useEffect(() => {
    if (isRefreshing) {
      setShowSyncIndicator(true);
      // Clear any existing timeout
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    } else if (showSyncIndicator) {
      // Keep showing for at least 1.5 seconds total
      syncTimeoutRef.current = setTimeout(() => {
        setShowSyncIndicator(false);
      }, 1500);
    }

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [isRefreshing]);

  const handleRefresh = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    refetchMeetings();
  }, [refetchMeetings]);

  const handleMeetingPress = (meeting: MeetingWithContact) => {
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

      <SyncIndicator visible={showSyncIndicator} />

      <FlatList
        data={filteredMeetings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MeetingCard 
            meeting={item} 
            onPress={() => handleMeetingPress(item)}
            meetingType={item.meeting_type_id ? meetingTypesMap.get(item.meeting_type_id) : undefined}
            currencySymbol={currencySymbol}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.accent}
            colors={[Colors.accent]}
          />
        }
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
  syncContainer: {
    overflow: "hidden",
    marginHorizontal: 24,
  },
  syncContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 12,
  },
  spinnerOuter: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  spinnerInner: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  spinnerArc: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: Colors.accent + "30",
    borderTopColor: Colors.accent,
  },
  syncText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.textSecondary,
    letterSpacing: 0.1,
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
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  billableBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.success + "20",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  billableText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.success,
  },
  contactBadge: {
    backgroundColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  contactText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.text,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: "600",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  typeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
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
