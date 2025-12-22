import { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, Plus, Clock, User, Building, Filter } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetings } from "@/contexts/MeetingContext";
import { useMeetingTypes } from "@/contexts/MeetingTypeContext";
import { useContacts } from "@/contexts/ContactContext";
import type { Meeting, Contact } from "@/types";
import Colors from "@/constants/colors";

type TabView = "meetings" | "contacts";
type DateFilter = "all" | "today" | "week" | "month";
type BillableFilter = "all" | "billable" | "non-billable";

const MeetingCard = ({ meeting, onPress }: { meeting: Meeting; onPress: () => void }) => {
  const title = meeting.title_override || meeting.auto_title;
  const date = new Date(meeting.created_at);
  const duration = Math.floor(meeting.duration_seconds / 60);
  const typeColor = meeting.meeting_type?.color || Colors.textMuted;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <View style={[styles.typeIndicator, { backgroundColor: typeColor }]} />
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
      </View>
      {meeting.meeting_type && (
        <View style={styles.meetingTypeBadge}>
          <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
          <Text style={styles.meetingTypeText}>{meeting.meeting_type.name}</Text>
        </View>
      )}
      <View style={styles.cardMeta}>
        <Text style={styles.cardDate}>
          {date.toLocaleDateString()} • {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
        {meeting.duration_seconds > 0 && (
          <View style={styles.durationContainer}>
            <Clock size={12} color={Colors.textMuted} />
            <Text style={styles.durationText}>{duration} min</Text>
          </View>
        )}
      </View>
      {meeting.client_name && (
        <View style={styles.clientTag}>
          <User size={12} color={Colors.accentLight} />
          <Text style={styles.clientText}>{meeting.client_name}</Text>
        </View>
      )}
    </Pressable>
  );
};

const ContactCard = ({ contact, onPress }: { contact: Contact; onPress: () => void }) => {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{contact.full_name}</Text>
        <View style={[styles.roleBadge, { backgroundColor: `${Colors.accentLight}20` }]}>
          <Text style={[styles.roleText, { color: Colors.accentLight }]}>
            {contact.role}
          </Text>
        </View>
      </View>
      {contact.company && (
        <View style={styles.companyRow}>
          <Building size={14} color={Colors.textMuted} />
          <Text style={styles.companyText}>{contact.company}</Text>
        </View>
      )}
      {(contact.email || contact.phone) && (
        <View style={styles.contactInfo}>
          {contact.email && <Text style={styles.contactDetail}>{contact.email}</Text>}
          {contact.phone && <Text style={styles.contactDetail}>{contact.phone}</Text>}
        </View>
      )}
    </Pressable>
  );
};

export default function MeetingsScreen() {
  const router = useRouter();
  const { meetings, isLoading: meetingsLoading } = useMeetings();
  const { meetingTypes } = useMeetingTypes();
  const { contacts, isLoading: contactsLoading, searchContacts } = useContacts();
  const [activeTab, setActiveTab] = useState<TabView>("meetings");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMeetingTypeId, setSelectedMeetingTypeId] = useState<string | "all">("all");
  const [selectedDateFilter, setSelectedDateFilter] = useState<DateFilter>("all");
  const [selectedBillableFilter, setSelectedBillableFilter] = useState<BillableFilter>("all");

  const handleTabSwitch = (tab: TabView) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setActiveTab(tab);
    setSearchQuery("");
    setShowFilters(false);
  };

  const toggleFilters = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowFilters(!showFilters);
  };

  const clearFilters = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedMeetingTypeId("all");
    setSelectedDateFilter("all");
    setSelectedBillableFilter("all");
  };

  const hasActiveFilters = selectedMeetingTypeId !== "all" || selectedDateFilter !== "all" || selectedBillableFilter !== "all";

  const handleMeetingPress = (meeting: Meeting) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(`/meeting/${meeting.id}`);
  };

  const handleContactPress = (contact: Contact) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(`/contact/${contact.id}` as any);
  };

  const handleAddContact = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push("/add-contact");
  };

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (m.status === "recording") return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const title = (m.title_override || m.auto_title).toLowerCase();
        const clientName = m.client_name?.toLowerCase() || "";
        if (!title.includes(query) && !clientName.includes(query)) return false;
      }

      if (selectedMeetingTypeId !== "all" && m.meeting_type_id !== selectedMeetingTypeId) {
        return false;
      }

      if (selectedBillableFilter !== "all") {
        if (selectedBillableFilter === "billable" && !m.billable) return false;
        if (selectedBillableFilter === "non-billable" && m.billable) return false;
      }

      if (selectedDateFilter !== "all") {
        const meetingDate = new Date(m.created_at);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        if (selectedDateFilter === "today") {
          const meetingDay = new Date(meetingDate.getFullYear(), meetingDate.getMonth(), meetingDate.getDate());
          if (meetingDay.getTime() !== today.getTime()) return false;
        } else if (selectedDateFilter === "week") {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          if (meetingDate < weekAgo) return false;
        } else if (selectedDateFilter === "month") {
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          if (meetingDate < monthAgo) return false;
        }
      }

      return true;
    });
  }, [meetings, searchQuery, selectedMeetingTypeId, selectedDateFilter, selectedBillableFilter]);

  const filteredContacts = searchQuery.trim()
    ? searchContacts(searchQuery)
    : contacts;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Meetings</Text>
      </View>

      <View style={styles.segmentedControl}>
        <Pressable
          style={[styles.segment, activeTab === "meetings" && styles.segmentActive]}
          onPress={() => handleTabSwitch("meetings")}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === "meetings" && styles.segmentTextActive,
            ]}
          >
            Meetings
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segment, activeTab === "contacts" && styles.segmentActive]}
          onPress={() => handleTabSwitch("contacts")}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === "contacts" && styles.segmentTextActive,
            ]}
          >
            Contacts
          </Text>
        </Pressable>
      </View>

      <View style={styles.searchContainer}>
        <Search size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={
            activeTab === "meetings"
              ? "Search meetings..."
              : "Search contacts..."
          }
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {activeTab === "meetings" && (
          <Pressable onPress={toggleFilters} style={styles.filterButton}>
            <Filter size={18} color={hasActiveFilters ? Colors.accentLight : Colors.textMuted} />
            {hasActiveFilters && <View style={styles.filterDot} />}
          </Pressable>
        )}
      </View>

      {activeTab === "meetings" && showFilters && (
        <View style={styles.filtersPanel}>
          <View style={styles.filterHeader}>
            <Text style={styles.filterTitle}>Filters</Text>
            {hasActiveFilters && (
              <Pressable onPress={clearFilters} style={styles.clearButton}>
                <Text style={styles.clearButtonText}>Clear All</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
              {(["all", "today", "week", "month"] as DateFilter[]).map((filter) => (
                <Pressable
                  key={filter}
                  style={[
                    styles.filterChip,
                    selectedDateFilter === filter && styles.filterChipActive,
                  ]}
                  onPress={() => {
                    if (Platform.OS !== "web") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setSelectedDateFilter(filter);
                  }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedDateFilter === filter && styles.filterChipTextActive,
                    ]}
                  >
                    {filter === "all" ? "All Time" : filter === "today" ? "Today" : filter === "week" ? "This Week" : "This Month"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
              <Pressable
                style={[
                  styles.filterChip,
                  selectedMeetingTypeId === "all" && styles.filterChipActive,
                ]}
                onPress={() => {
                  if (Platform.OS !== "web") {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  setSelectedMeetingTypeId("all");
                }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedMeetingTypeId === "all" && styles.filterChipTextActive,
                  ]}
                >
                  All Types
                </Text>
              </Pressable>
              {meetingTypes.map((type) => (
                <Pressable
                  key={type.id}
                  style={[
                    styles.filterChip,
                    selectedMeetingTypeId === type.id && styles.filterChipActive,
                    selectedMeetingTypeId === type.id && { borderColor: type.color },
                  ]}
                  onPress={() => {
                    if (Platform.OS !== "web") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setSelectedMeetingTypeId(type.id);
                  }}
                >
                  <View style={[styles.filterChipDot, { backgroundColor: type.color }]} />
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedMeetingTypeId === type.id && styles.filterChipTextActive,
                    ]}
                  >
                    {type.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Billing</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
              {(["all", "billable", "non-billable"] as BillableFilter[]).map((filter) => (
                <Pressable
                  key={filter}
                  style={[
                    styles.filterChip,
                    selectedBillableFilter === filter && styles.filterChipActive,
                  ]}
                  onPress={() => {
                    if (Platform.OS !== "web") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setSelectedBillableFilter(filter);
                  }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedBillableFilter === filter && styles.filterChipTextActive,
                    ]}
                  >
                    {filter === "all" ? "All" : filter === "billable" ? "Billable" : "Non-Billable"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {activeTab === "meetings" ? (
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
                {meetingsLoading ? "Loading meetings..." : "No meetings found"}
              </Text>
            </View>
          }
        />
      ) : (
        <>
          <FlatList
            data={filteredContacts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ContactCard contact={item} onPress={() => handleContactPress(item)} />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  {contactsLoading ? "Loading contacts..." : "No contacts found"}
                </Text>
                <Text style={styles.emptyHint}>
                  Tap the button below to add your first contact
                </Text>
              </View>
            }
          />
          <Pressable style={styles.fab} onPress={handleAddContact}>
            <Plus size={28} color={Colors.text} strokeWidth={2} />
          </Pressable>
        </>
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
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "700" as const,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  segmentedControl: {
    flexDirection: "row",
    marginHorizontal: 24,
    marginBottom: 20,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: Colors.accentLight,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: Colors.textMuted,
  },
  segmentTextActive: {
    color: Colors.text,
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
  filterButton: {
    padding: 4,
    position: "relative" as const,
  },
  filterDot: {
    position: "absolute" as const,
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accentLight,
  },
  filtersPanel: {
    marginHorizontal: 24,
    marginBottom: 20,
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  filterTitle: {
    fontSize: 17,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  clearButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearButtonText: {
    fontSize: 14,
    color: Colors.accentLight,
    fontWeight: "600" as const,
  },
  filterSection: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.textSecondary,
    marginBottom: 10,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  filterChips: {
    flexDirection: "row",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: Colors.accentLight,
    borderColor: Colors.accentLight,
  },
  filterChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterChipText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: "500" as const,
  },
  filterChipTextActive: {
    color: Colors.text,
    fontWeight: "600" as const,
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
    gap: 10,
  },
  typeIndicator: {
    width: 4,
    height: 20,
    borderRadius: 2,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600" as const,
    color: Colors.text,
    letterSpacing: -0.2,
  },
  meetingTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  typeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  meetingTypeText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: "500" as const,
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
  clientTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  clientText: {
    fontSize: 13,
    color: Colors.accentLight,
    fontWeight: "500" as const,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleText: {
    fontSize: 11,
    fontWeight: "600" as const,
  },
  companyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  companyText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  contactInfo: {
    marginTop: 8,
    gap: 4,
  },
  contactDetail: {
    fontSize: 13,
    color: Colors.textMuted,
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
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accentLight,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: Colors.accentLight,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
