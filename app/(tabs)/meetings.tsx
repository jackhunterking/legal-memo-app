import { useState } from "react";
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
import { Search, Plus, Clock, User, Building } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetings } from "@/contexts/MeetingContext";
import { useContacts } from "@/contexts/ContactContext";
import type { Meeting, Contact } from "@/types";
import Colors from "@/constants/colors";

type TabView = "meetings" | "contacts";

const MeetingCard = ({ meeting, onPress }: { meeting: Meeting; onPress: () => void }) => {
  const title = meeting.title_override || meeting.auto_title;
  const date = new Date(meeting.created_at);
  const duration = Math.floor(meeting.duration_seconds / 60);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
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
  const { contacts, isLoading: contactsLoading, searchContacts } = useContacts();
  const [activeTab, setActiveTab] = useState<TabView>("meetings");
  const [searchQuery, setSearchQuery] = useState("");

  const handleTabSwitch = (tab: TabView) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setActiveTab(tab);
    setSearchQuery("");
  };

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

  const filteredMeetings = meetings.filter((m) => {
    if (!searchQuery.trim()) return m.status !== "recording";
    const query = searchQuery.toLowerCase();
    const title = (m.title_override || m.auto_title).toLowerCase();
    const clientName = m.client_name?.toLowerCase() || "";
    return (
      m.status !== "recording" && (title.includes(query) || clientName.includes(query))
    );
  });

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
      </View>

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
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600" as const,
    color: Colors.text,
    marginRight: 12,
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
