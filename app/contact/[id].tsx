import { useState, useEffect, useMemo } from "react";
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
import { ArrowLeft, Trash2, Mail, Phone, Building, Calendar, Clock, DollarSign, FileText, TrendingUp } from "lucide-react-native";
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

  const stats = useMemo(() => {
    const totalMeetings = linkedMeetings.length;
    const totalSeconds = linkedMeetings.reduce((sum, m) => sum + m.duration_seconds, 0);
    const totalBillableSeconds = linkedMeetings.reduce((sum, m) => 
      m.billable ? sum + m.billable_seconds : sum, 0
    );
    const totalBilled = linkedMeetings.reduce((sum, m) => {
      if (!m.billable) return sum;
      const hours = m.billable_seconds / 3600;
      return sum + (hours * m.hourly_rate_snapshot);
    }, 0);

    const meetingsByType = linkedMeetings.reduce((acc, m) => {
      const typeName = m.meeting_type?.name || 'Unknown';
      acc[typeName] = (acc[typeName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const completedMeetings = linkedMeetings.filter(m => m.status === 'ready').length;

    return {
      totalMeetings,
      totalSeconds,
      totalBillableSeconds,
      totalBilled,
      meetingsByType,
      completedMeetings,
    };
  }, [linkedMeetings]);

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatCurrency = (amount: number): string => {
    return `${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

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

        {linkedMeetings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activity Summary</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <FileText size={20} color={Colors.accentLight} />
                </View>
                <Text style={styles.statValue}>{stats.totalMeetings}</Text>
                <Text style={styles.statLabel}>Total Meetings</Text>
                <Text style={styles.statSubLabel}>{stats.completedMeetings} completed</Text>
              </View>
              
              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <Clock size={20} color={Colors.accentLight} />
                </View>
                <Text style={styles.statValue}>{formatDuration(stats.totalSeconds)}</Text>
                <Text style={styles.statLabel}>Total Time</Text>
                <Text style={styles.statSubLabel}>{formatDuration(stats.totalBillableSeconds)} billable</Text>
              </View>
              
              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <DollarSign size={20} color={Colors.success} />
                </View>
                <Text style={styles.statValue}>{formatCurrency(stats.totalBilled)}</Text>
                <Text style={styles.statLabel}>Total Billed</Text>
                <Text style={styles.statSubLabel}>
                  {linkedMeetings.filter(m => m.billable).length} billable meetings
                </Text>
              </View>
              
              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <TrendingUp size={20} color={Colors.accentLight} />
                </View>
                <Text style={styles.statValue}>
                  {stats.totalBillableSeconds > 0 
                    ? formatCurrency((stats.totalBilled / (stats.totalBillableSeconds / 3600)))
                    : '$0'}
                </Text>
                <Text style={styles.statLabel}>Avg Rate</Text>
                <Text style={styles.statSubLabel}>per hour</Text>
              </View>
            </View>
          </View>
        )}

        {Object.keys(stats.meetingsByType).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Meeting Types</Text>
            <View style={styles.typesList}>
              {Object.entries(stats.meetingsByType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <View key={type} style={styles.typeRow}>
                    <View style={styles.typeDot} />
                    <Text style={styles.typeText} numberOfLines={1}>{type}</Text>
                    <View style={styles.typeCountBadge}>
                      <Text style={styles.typeCount}>{count}</Text>
                    </View>
                  </View>
                ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Meeting History ({linkedMeetings.length})
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
                const billedAmount = meeting.billable 
                  ? (meeting.billable_seconds / 3600) * meeting.hourly_rate_snapshot
                  : 0;
                
                return (
                  <Pressable
                    key={meeting.id}
                    style={styles.meetingCard}
                    onPress={() => handleMeetingPress(meeting)}
                  >
                    <View style={styles.meetingCardHeader}>
                      <Text style={styles.meetingTitle} numberOfLines={1}>
                        {title}
                      </Text>
                      {meeting.billable && (
                        <View style={styles.billableBadge}>
                          <DollarSign size={12} color={Colors.success} />
                        </View>
                      )}
                    </View>
                    
                    <View style={styles.meetingType}>
                      <View style={styles.meetingTypeDot} />
                      <Text style={styles.meetingTypeText} numberOfLines={1}>
                        {meeting.meeting_type?.name || 'Unknown'}
                      </Text>
                    </View>
                    
                    <View style={styles.meetingDetailsRow}>
                      <View style={styles.meetingDetail}>
                        <Calendar size={12} color={Colors.textMuted} />
                        <Text style={styles.meetingDetailText}>
                          {date.toLocaleDateString()}
                        </Text>
                      </View>
                      
                      {meeting.duration_seconds > 0 && (
                        <View style={styles.meetingDetail}>
                          <Clock size={12} color={Colors.textMuted} />
                          <Text style={styles.meetingDetailText}>
                            {formatDuration(meeting.duration_seconds)}
                          </Text>
                        </View>
                      )}
                    </View>
                    
                    {meeting.billable && billedAmount > 0 && (
                      <View style={styles.billedAmountContainer}>
                        <Text style={styles.billedAmount}>
                          {formatCurrency(billedAmount)}
                        </Text>
                        <Text style={styles.billedRate}>
                          @ ${meeting.hourly_rate_snapshot}/hr
                        </Text>
                      </View>
                    )}
                    
                    <View style={styles.meetingStatusContainer}>
                      <View style={[
                        styles.statusDot,
                        meeting.status === 'ready' && styles.statusDotReady,
                        meeting.status === 'processing' && styles.statusDotProcessing,
                        meeting.status === 'failed' && styles.statusDotFailed,
                      ]} />
                      <Text style={styles.statusText}>
                        {meeting.status === 'ready' ? 'Completed' : 
                         meeting.status === 'processing' ? 'Processing' :
                         meeting.status === 'recording' ? 'Recording' :
                         meeting.status === 'uploading' ? 'Uploading' : 'Failed'}
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.accentLight}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  statSubLabel: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  typesList: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accentLight,
  },
  typeText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  typeCountBadge: {
    backgroundColor: `${Colors.accentLight}20`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeCount: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.accentLight,
  },
  meetingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  billableBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: `${Colors.success}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  meetingType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  meetingTypeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  meetingTypeText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textMuted,
  },
  meetingDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  meetingDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  meetingDetailText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  billedAmountContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: `${Colors.success}08`,
    borderRadius: 8,
    marginBottom: 10,
  },
  billedAmount: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.success,
  },
  billedRate: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  meetingStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textMuted,
  },
  statusDotReady: {
    backgroundColor: Colors.success,
  },
  statusDotProcessing: {
    backgroundColor: Colors.accentLight,
  },
  statusDotFailed: {
    backgroundColor: Colors.error,
  },
  statusText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500' as const,
  },
});
