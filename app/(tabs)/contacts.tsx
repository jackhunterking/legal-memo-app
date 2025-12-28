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
  SectionList,
  Animated,
  Easing,
  Modal,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, Plus, User, Building2, ChevronRight, Tag, X, Check, Filter } from "lucide-react-native";
import { lightImpact, mediumImpact, successNotification } from "@/lib/haptics";
import { useContacts } from "@/contexts/ContactContext";
import type { ContactWithCategory, ContactCategory } from "@/types";
import { formatContactName, getContactInitials } from "@/types";
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
        <Text style={styles.syncText}>Syncing your contacts...</Text>
      </Animated.View>
    </Animated.View>
  );
};

/**
 * Category Filter Modal
 * Bottom sheet for filtering contacts by category
 */
const CategoryFilterModal = ({
  visible,
  onClose,
  categories,
  selectedCategoryId,
  onSelect,
  contactCounts,
}: {
  visible: boolean;
  onClose: () => void;
  categories: ContactCategory[];
  selectedCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
  contactCounts: { total: number; [key: string]: number };
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={filterModalStyles.overlay}>
        <Pressable style={filterModalStyles.backdrop} onPress={onClose} />
        <View style={filterModalStyles.container}>
          <View style={filterModalStyles.handle} />
          <View style={filterModalStyles.header}>
            <Text style={filterModalStyles.title}>Filter</Text>
            <Pressable onPress={onClose} style={filterModalStyles.closeButton}>
              <X size={24} color="#ffffff" />
            </Pressable>
          </View>

          <ScrollView 
            style={filterModalStyles.scrollContent}
            contentContainerStyle={filterModalStyles.scrollContentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* All Contacts Option */}
            <Pressable
              style={[
                filterModalStyles.option,
                selectedCategoryId === null && filterModalStyles.optionSelected,
              ]}
              onPress={() => onSelect(null)}
            >
              <View style={filterModalStyles.optionLeft}>
                <View style={[filterModalStyles.dot, { backgroundColor: Colors.textMuted }]} />
                <Text style={filterModalStyles.optionName}>All Contacts</Text>
              </View>
              <View style={filterModalStyles.optionRight}>
                <Text style={filterModalStyles.optionCount}>{contactCounts.total}</Text>
                {selectedCategoryId === null && (
                  <Check size={20} color={Colors.accentLight} />
                )}
              </View>
            </Pressable>

            {/* Category Options */}
            {categories.map((category) => (
              <Pressable
                key={category.id}
                style={[
                  filterModalStyles.option,
                  selectedCategoryId === category.id && filterModalStyles.optionSelected,
                ]}
                onPress={() => onSelect(category.id)}
              >
                <View style={filterModalStyles.optionLeft}>
                  <View style={[filterModalStyles.dot, { backgroundColor: category.color }]} />
                  <Text style={filterModalStyles.optionName}>{category.name}</Text>
                </View>
                <View style={filterModalStyles.optionRight}>
                  <Text style={filterModalStyles.optionCount}>
                    {contactCounts[category.id] || 0}
                  </Text>
                  {selectedCategoryId === category.id && (
                    <Check size={20} color={Colors.accentLight} />
                  )}
                </View>
              </Pressable>
            ))}

            {/* Uncategorized Option */}
            <Pressable
              style={[
                filterModalStyles.option,
                selectedCategoryId === 'uncategorized' && filterModalStyles.optionSelected,
              ]}
              onPress={() => onSelect('uncategorized')}
            >
              <View style={filterModalStyles.optionLeft}>
                <View style={[filterModalStyles.dot, { backgroundColor: Colors.textMuted }]} />
                <Text style={filterModalStyles.optionName}>Uncategorized</Text>
              </View>
              <View style={filterModalStyles.optionRight}>
                <Text style={filterModalStyles.optionCount}>
                  {contactCounts['uncategorized'] || 0}
                </Text>
                {selectedCategoryId === 'uncategorized' && (
                  <Check size={20} color={Colors.accentLight} />
                )}
              </View>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// Contact Card Component
const ContactCard = ({ 
  contact, 
  onPress,
}: { 
  contact: ContactWithCategory; 
  onPress: () => void;
}) => {
  const initials = getContactInitials(contact);
  const displayName = formatContactName(contact);
  const category = contact.category;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {/* Avatar with initials */}
      <View style={[styles.avatar, { backgroundColor: category?.color || Colors.accentLight }]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardName} numberOfLines={1}>
            {displayName}
          </Text>
          {category && (
            <View style={[styles.categoryBadge, { backgroundColor: category.color + "20" }]}>
              <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
              <Text style={[styles.categoryText, { color: category.color }]}>
                {category.name}
              </Text>
            </View>
          )}
        </View>
        
        {contact.company && (
          <View style={styles.companyRow}>
            <Building2 size={12} color={Colors.textMuted} />
            <Text style={styles.companyText} numberOfLines={1}>
              {contact.company}
            </Text>
          </View>
        )}
        
        {(contact.email || contact.phone) && (
          <Text style={styles.contactInfo} numberOfLines={1}>
            {contact.email || contact.phone}
          </Text>
        )}
      </View>
      
      <ChevronRight size={18} color={Colors.textMuted} />
    </Pressable>
  );
};

// Empty State Component
const EmptyState = ({ hasSearch }: { hasSearch: boolean }) => (
  <View style={styles.emptyState}>
    <View style={styles.emptyIconContainer}>
      <User size={48} color={Colors.textMuted} />
    </View>
    <Text style={styles.emptyTitle}>
      {hasSearch ? "No contacts found" : "No contacts yet"}
    </Text>
    <Text style={styles.emptyDescription}>
      {hasSearch 
        ? "Try a different search term"
        : "Add your first contact to link meetings and keep track of client interactions"
      }
    </Text>
  </View>
);

export default function ContactsScreen() {
  const router = useRouter();
  const { 
    contacts, 
    contactCategories,
    isContactsLoading, 
    isContactsRefreshing, 
    refetchContacts 
  } = useContacts();
  const [searchQuery, setSearchQuery] = useState("");
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [showSyncIndicator, setShowSyncIndicator] = useState(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Filter state
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Handle sync indicator visibility (minimum 1.5 seconds)
  useEffect(() => {
    if (isContactsRefreshing) {
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
  }, [isContactsRefreshing]);

  const handleRefresh = useCallback(() => {
    mediumImpact();
    refetchContacts();
  }, [refetchContacts]);

  const handleContactPress = (contact: ContactWithCategory) => {
    if (Platform.OS !== "web") {
      lightImpact();
    }
    router.push(`/contact/${contact.id}`);
  };

  const handleAddContact = () => {
    if (Platform.OS !== "web") {
      lightImpact();
    }
    router.push("/edit-contact");
  };

  const handleFilterSelect = (categoryId: string | null) => {
    if (Platform.OS !== "web") {
      lightImpact();
    }
    setFilterCategoryId(categoryId);
    setShowFilterModal(false);
  };

  const handleClearFilter = () => {
    if (Platform.OS !== "web") {
      lightImpact();
    }
    setFilterCategoryId(null);
  };

  // Calculate contact counts per category (for filter modal)
  const contactCounts = useMemo(() => {
    const counts: { total: number; uncategorized: number; [key: string]: number } = {
      total: contacts.length,
      uncategorized: 0,
    };
    
    contacts.forEach((c) => {
      if (c.category_id) {
        counts[c.category_id] = (counts[c.category_id] || 0) + 1;
      } else {
        counts.uncategorized += 1;
      }
    });
    
    return counts;
  }, [contacts]);

  // Get the selected filter category for display
  const selectedFilterCategory = filterCategoryId && filterCategoryId !== 'uncategorized'
    ? contactCategories.find(c => c.id === filterCategoryId)
    : null;

  // Filter contacts based on search query AND category filter
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      // Category filter
      if (filterCategoryId) {
        if (filterCategoryId === 'uncategorized') {
          if (c.category_id) return false;
        } else {
          if (c.category_id !== filterCategoryId) return false;
        }
      }
      
      // Search query filter
      if (!searchQuery.trim()) return true;
      
      const query = searchQuery.toLowerCase();
      const fullName = formatContactName(c).toLowerCase();
      const company = c.company?.toLowerCase() || '';
      const email = c.email?.toLowerCase() || '';
      const phone = c.phone || '';
      const categoryName = c.category?.name?.toLowerCase() || '';
      
      return fullName.includes(query) || 
             company.includes(query) || 
             email.includes(query) ||
             phone.includes(query) ||
             categoryName.includes(query);
    });
  }, [contacts, searchQuery, filterCategoryId]);

  // Group contacts by category for section list
  const groupedContacts = useMemo(() => {
    if (!groupByCategory) return null;
    
    const groups: { [key: string]: ContactWithCategory[] } = {};
    const uncategorized: ContactWithCategory[] = [];
    
    filteredContacts.forEach((contact) => {
      if (contact.category) {
        const categoryName = contact.category.name;
        if (!groups[categoryName]) {
          groups[categoryName] = [];
        }
        groups[categoryName].push(contact);
      } else {
        uncategorized.push(contact);
      }
    });
    
    // Sort categories by display_order
    const sortedCategories = contactCategories
      .filter(cat => groups[cat.name])
      .sort((a, b) => a.display_order - b.display_order);
    
    const sections = sortedCategories.map(cat => ({
      title: cat.name,
      color: cat.color,
      data: groups[cat.name].sort((a, b) => 
        formatContactName(a).localeCompare(formatContactName(b))
      ),
    }));
    
    // Add uncategorized at the end if any
    if (uncategorized.length > 0) {
      sections.push({
        title: 'Uncategorized',
        color: Colors.textMuted,
        data: uncategorized.sort((a, b) => 
          formatContactName(a).localeCompare(formatContactName(b))
        ),
      });
    }
    
    return sections;
  }, [filteredContacts, contactCategories, groupByCategory]);

  // Sort contacts alphabetically for flat list
  const sortedContacts = useMemo(() => {
    if (groupByCategory) return null;
    return [...filteredContacts].sort((a, b) => 
      formatContactName(a).localeCompare(formatContactName(b))
    );
  }, [filteredContacts, groupByCategory]);

  const renderSectionHeader = ({ section }: { section: { title: string; color: string } }) => (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionDot, { backgroundColor: section.color }]} />
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionCount}>
        {groupedContacts?.find(s => s.title === section.title)?.data.length || 0}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Contacts</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.addButton} onPress={handleAddContact}>
            <Plus size={20} color={Colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchWrapper}>
        <View style={styles.searchContainer}>
          <Search size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search contacts..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <Pressable 
          style={[styles.filterButton, filterCategoryId && styles.filterButtonActive]}
          onPress={() => setShowFilterModal(true)}
        >
          <Filter size={18} color={filterCategoryId ? (selectedFilterCategory?.color || Colors.accentLight) : Colors.text} />
          {filterCategoryId && (
            <View style={[styles.filterBadge, { backgroundColor: selectedFilterCategory?.color || Colors.accentLight }]} />
          )}
        </Pressable>
      </View>

      {/* Filter Banner */}
      {filterCategoryId && (
        <View style={styles.filterBanner}>
          <View style={styles.filterBannerLeft}>
            <View style={[styles.filterBannerDot, { backgroundColor: selectedFilterCategory?.color || Colors.textMuted }]} />
            <Text style={styles.filterBannerText}>
              {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''} in{' '}
              <Text style={styles.filterBannerCategory}>
                {filterCategoryId === 'uncategorized' ? 'Uncategorized' : selectedFilterCategory?.name}
              </Text>
            </Text>
          </View>
          <Pressable style={styles.filterBannerClose} onPress={handleClearFilter}>
            <X size={16} color={Colors.textMuted} />
          </Pressable>
        </View>
      )}

      <SyncIndicator visible={showSyncIndicator} />

      {groupByCategory && groupedContacts ? (
        <SectionList
          sections={groupedContacts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ContactCard 
              contact={item} 
              onPress={() => handleContactPress(item)}
            />
          )}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isContactsRefreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.accent}
              colors={[Colors.accent]}
            />
          }
          ListEmptyComponent={
            <EmptyState hasSearch={!!searchQuery.trim()} />
          }
        />
      ) : (
        <FlatList
          data={sortedContacts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ContactCard 
              contact={item} 
              onPress={() => handleContactPress(item)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isContactsRefreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.accent}
              colors={[Colors.accent]}
            />
          }
          ListEmptyComponent={
            <EmptyState hasSearch={!!searchQuery.trim()} />
          }
        />
      )}

      {/* Category Filter Modal */}
      <CategoryFilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        categories={contactCategories}
        selectedCategoryId={filterCategoryId}
        onSelect={handleFilterSelect}
        contactCounts={contactCounts}
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    position: "relative",
  },
  filterButtonActive: {
    borderColor: Colors.accentLight,
    backgroundColor: Colors.accentLight + "15",
  },
  filterBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accentLight,
    justifyContent: "center",
    alignItems: "center",
  },
  filterBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 24,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  filterBannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterBannerText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  filterBannerCategory: {
    fontWeight: "600",
    color: Colors.text,
  },
  filterBannerClose: {
    padding: 4,
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
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 24,
    marginBottom: 16,
    gap: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingTop: 20,
    gap: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
    flex: 1,
  },
  sectionCount: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  cardName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
    flexShrink: 1,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
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
  companyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  companyText: {
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
  },
  contactInfo: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyDescription: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
});

// Filter Modal Styles (matches category selector from contact detail)
const filterModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  container: {
    backgroundColor: '#1a1f2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "60%",
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#4b5563',
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: '#ffffff',
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContentContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#252b3d',
    borderRadius: 12,
    marginBottom: 10,
  },
  optionSelected: {
    borderWidth: 2,
    borderColor: Colors.accentLight,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  optionName: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: "500",
  },
  optionCount: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: "500",
  },
});

