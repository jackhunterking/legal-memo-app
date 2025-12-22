import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Trash2, Mail, Phone, Building, Calendar } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useContacts } from "@/contexts/ContactContext";
import { useMeetings } from "@/contexts/MeetingContext";
import type { Meeting } from "@/types";
import Colors from "@/constants/colors";

export default function ContactDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getContactById, deleteContact, isDeleting } = useContacts();
  const { meetings } = useMeetings();
  
  const contact = getContactById(id);

  const [linkedMeetings, setLinkedMeetings] = useState<Meeting[]>([]);

  useEffect(() => {
    if (contact) {
      const linked = meetings.filter((m) => m.primary_contact_id === contact.id);
      setLinkedMeetings(linked);
    }
  }, [contact, meetings]);

  const handleBack = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  };

  const handleDelete = () => {
    if (!contact) return;

    const performDelete = async () => {
      try {
        await deleteContact(contact.id);
        router.back();
      } catch (err) {
        console.error("[ContactDetail] Delete error:", err);
      }
    };

    if (Platform.OS === "web") {
      if (confirm(`Delete ${contact.full_name}? This cannot be undone.`)) {
        performDelete();
      }
    } else {
      Alert.alert(
        "Delete Contact",
        `Delete ${contact.full_name}? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: performDelete },
        ]
      );
    }
  };

  const handleMeetingPress = (meeting: Meeting) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(`/meeting/${meeting.id}`);
  };

  if (!contact) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={handleBack}>
            <ArrowLeft size={24} color={Colors.text} />
          </Pressable>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Contact not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <ArrowLeft size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconButton} onPress={handleDelete} disabled={isDeleting}>
            <Trash2 size={20} color={Colors.error} />
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {contact.full_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name}>{contact.full_name}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{contact.role}</Text>
          </View>
        </View>

        {(contact.company || contact.email || contact.phone) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact Information</Text>
            <View style={styles.infoCard}>
              {contact.company && (
                <View style={styles.infoRow}>
                  <Building size={18} color={Colors.textMuted} />
                  <Text style={styles.infoText}>{contact.company}</Text>
                </View>
              )}
              {contact.email && (
                <View style={styles.infoRow}>
                  <Mail size={18} color={Colors.textMuted} />
                  <Text style={styles.infoText}>{contact.email}</Text>
                </View>
              )}
              {contact.phone && (
                <View style={styles.infoRow}>
                  <Phone size={18} color={Colors.textMuted} />
                  <Text style={styles.infoText}>{contact.phone}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {contact.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{contact.notes}</Text>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Linked Meetings ({linkedMeetings.length})
          </Text>
          {linkedMeetings.length === 0 ? (
            <View style={styles.emptyMeetings}>
              <Text style={styles.emptyMeetingsText}>
                No meetings linked to this contact
              </Text>
            </View>
          ) : (
            <View style={styles.meetingsList}>
              {linkedMeetings.map((meeting) => {
                const title = meeting.title_override || meeting.auto_title;
                const date = new Date(meeting.created_at);
                return (
                  <Pressable
                    key={meeting.id}
                    style={styles.meetingCard}
                    onPress={() => handleMeetingPress(meeting)}
                  >
                    <Text style={styles.meetingTitle} numberOfLines={1}>
                      {title}
                    </Text>
                    <View style={styles.meetingMeta}>
                      <Calendar size={12} color={Colors.textMuted} />
                      <Text style={styles.meetingDate}>
                        {date.toLocaleDateString()}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  profileSection: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.accentLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  name: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: Colors.text,
    marginBottom: 12,
    textAlign: "center",
  },
  roleBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: `${Colors.accentLight}20`,
  },
  roleText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.accentLight,
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.text,
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoText: {
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  notesCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notesText: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  emptyMeetings: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyMeetingsText: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  meetingsList: {
    gap: 12,
  },
  meetingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  meetingTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.text,
    marginBottom: 8,
  },
  meetingMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  meetingDate: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textMuted,
  },
});
