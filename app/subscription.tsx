/**
 * Subscription Management Screen
 * 
 * Displays:
 * - Current subscription status
 * - Usage this billing period
 * - Free trial status (if applicable)
 * - Subscribe/Upgrade button
 * - Link to Polar customer portal
 */

import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  CreditCard,
  Clock,
  TrendingUp,
  Gift,
  AlertTriangle,
  ExternalLink,
  Check,
  Zap,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useUsage } from "@/contexts/UsageContext";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { SUBSCRIPTION_PLAN, formatUsage, calculateOverageCharge } from "@/types";

// Polar checkout URL - replace with your actual checkout link
const POLAR_CHECKOUT_URL = process.env.EXPO_PUBLIC_POLAR_CHECKOUT_URL || "https://polar.sh/checkout";
const POLAR_PORTAL_URL = "https://polar.sh/purchases/subscriptions";

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { 
    usageState, 
    isLoading, 
    refreshUsage, 
    hasActiveSubscription,
    isInFreeTrial,
    transactions,
  } = useUsage();
  
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshUsage();
    setIsRefreshing(false);
  };

  const handleSubscribe = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      // Build checkout URL with user metadata for linking
      const checkoutUrl = `${POLAR_CHECKOUT_URL}?metadata[user_id]=${user?.id}&metadata[email]=${encodeURIComponent(user?.email || "")}`;
      
      const supported = await Linking.canOpenURL(checkoutUrl);
      if (supported) {
        await Linking.openURL(checkoutUrl);
      } else {
        Alert.alert("Error", "Unable to open checkout page. Please try again later.");
      }
    } catch (error) {
      console.error("[Subscription] Error opening checkout:", error);
      Alert.alert("Error", "Unable to open checkout page. Please try again later.");
    }
  };

  const handleManageSubscription = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      const supported = await Linking.canOpenURL(POLAR_PORTAL_URL);
      if (supported) {
        await Linking.openURL(POLAR_PORTAL_URL);
      } else {
        Alert.alert("Error", "Unable to open billing portal. Please try again later.");
      }
    } catch (error) {
      console.error("[Subscription] Error opening portal:", error);
      Alert.alert("Error", "Unable to open billing portal. Please try again later.");
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Loading subscription info...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Subscription</Text>
        <Pressable 
          style={styles.refreshButton} 
          onPress={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Text style={styles.refreshText}>Refresh</Text>
          )}
        </Pressable>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={[
          styles.statusCard,
          hasActiveSubscription ? styles.statusCardActive : 
          isInFreeTrial ? styles.statusCardTrial : styles.statusCardInactive
        ]}>
          <View style={styles.statusHeader}>
            {hasActiveSubscription ? (
              <>
                <View style={styles.statusBadge}>
                  <Check size={16} color="#10B981" />
                  <Text style={styles.statusBadgeText}>Active</Text>
                </View>
                <Text style={styles.statusTitle}>Pro Subscriber</Text>
              </>
            ) : isInFreeTrial ? (
              <>
                <View style={[styles.statusBadge, styles.statusBadgeTrial]}>
                  <Gift size={16} color="#F59E0B" />
                  <Text style={[styles.statusBadgeText, styles.statusBadgeTextTrial]}>Free Trial</Text>
                </View>
                <Text style={styles.statusTitle}>Trial Mode</Text>
              </>
            ) : (
              <>
                <View style={[styles.statusBadge, styles.statusBadgeInactive]}>
                  <AlertTriangle size={16} color={Colors.error} />
                  <Text style={[styles.statusBadgeText, styles.statusBadgeTextInactive]}>No Credits</Text>
                </View>
                <Text style={styles.statusTitle}>Subscribe to Continue</Text>
              </>
            )}
          </View>
          
          {hasActiveSubscription && usageState.subscription && (
            <Text style={styles.statusSubtitle}>
              {usageState.subscription.plan_name}
            </Text>
          )}
        </View>

        {/* Usage Stats */}
        <Text style={styles.sectionTitle}>Usage This Month</Text>
        <View style={styles.statsGrid}>
          {hasActiveSubscription ? (
            <>
              <View style={styles.statCard}>
                <Clock size={24} color={Colors.accent} />
                <Text style={styles.statValue}>
                  {usageState.minutesUsedThisPeriod}
                </Text>
                <Text style={styles.statLabel}>Minutes Used</Text>
              </View>
              
              <View style={styles.statCard}>
                <TrendingUp size={24} color={Colors.success} />
                <Text style={styles.statValue}>
                  {usageState.minutesRemaining > 0 ? usageState.minutesRemaining : 0}
                </Text>
                <Text style={styles.statLabel}>Minutes Left</Text>
              </View>
              
              {usageState.overageMinutes > 0 && (
                <View style={[styles.statCard, styles.statCardWarning]}>
                  <AlertTriangle size={24} color={Colors.warning} />
                  <Text style={[styles.statValue, styles.statValueWarning]}>
                    ${usageState.estimatedOverageCharge.toFixed(2)}
                  </Text>
                  <Text style={styles.statLabel}>Overage Charges</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.statCard}>
              <Gift size={24} color={Colors.warning} />
              <Text style={styles.statValue}>
                {usageState.freeTrialMinutesRemaining}
              </Text>
              <Text style={styles.statLabel}>Free Minutes Left</Text>
            </View>
          )}
        </View>

        {/* Lifetime Stats */}
        <View style={styles.lifetimeCard}>
          <Text style={styles.lifetimeLabel}>Lifetime Usage</Text>
          <Text style={styles.lifetimeValue}>
            {usageState.lifetimeMinutesUsed} minutes transcribed
          </Text>
        </View>

        {/* Plan Details */}
        <Text style={styles.sectionTitle}>Plan Details</Text>
        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <Zap size={24} color={Colors.accent} />
            <View style={styles.planHeaderText}>
              <Text style={styles.planName}>{SUBSCRIPTION_PLAN.name}</Text>
              <Text style={styles.planPrice}>
                ${SUBSCRIPTION_PLAN.priceMonthly}/month
              </Text>
            </View>
          </View>
          
          <View style={styles.planFeatures}>
            <View style={styles.planFeature}>
              <Check size={16} color={Colors.success} />
              <Text style={styles.planFeatureText}>
                {SUBSCRIPTION_PLAN.minutesIncluded} minutes included per month
              </Text>
            </View>
            <View style={styles.planFeature}>
              <Check size={16} color={Colors.success} />
              <Text style={styles.planFeatureText}>
                AI-powered transcription with speaker detection
              </Text>
            </View>
            <View style={styles.planFeature}>
              <Check size={16} color={Colors.success} />
              <Text style={styles.planFeatureText}>
                Automatic meeting summaries
              </Text>
            </View>
            <View style={styles.planFeature}>
              <Check size={16} color={Colors.success} />
              <Text style={styles.planFeatureText}>
                Shareable meeting links
              </Text>
            </View>
            <View style={styles.planFeature}>
              <AlertTriangle size={16} color={Colors.warning} />
              <Text style={styles.planFeatureText}>
                ${(SUBSCRIPTION_PLAN.overageRateCents / 100).toFixed(2)}/min overage
              </Text>
            </View>
          </View>
        </View>

        {/* Billing Period */}
        {hasActiveSubscription && usageState.periodEnd && (
          <View style={styles.billingCard}>
            <Text style={styles.billingLabel}>Current Billing Period</Text>
            <Text style={styles.billingValue}>
              {usageState.daysRemainingInPeriod} days remaining
            </Text>
            <Text style={styles.billingDate}>
              Renews on {usageState.periodEnd.toLocaleDateString()}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          {hasActiveSubscription ? (
            <Pressable
              style={styles.manageButton}
              onPress={handleManageSubscription}
            >
              <CreditCard size={20} color={Colors.text} />
              <Text style={styles.manageButtonText}>Manage Subscription</Text>
              <ExternalLink size={16} color={Colors.textMuted} />
            </Pressable>
          ) : (
            <Pressable
              style={styles.subscribeButton}
              onPress={handleSubscribe}
            >
              <Zap size={20} color="#000" />
              <Text style={styles.subscribeButtonText}>
                Subscribe for ${SUBSCRIPTION_PLAN.priceMonthly}/month
              </Text>
            </Pressable>
          )}
        </View>

        {/* Recent Transactions */}
        {transactions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <View style={styles.transactionsCard}>
              {transactions.slice(0, 5).map((transaction) => (
                <View key={transaction.id} style={styles.transactionRow}>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionType}>
                      {transaction.transaction_type === 'recording' ? 'Recording' :
                       transaction.transaction_type === 'free_trial' ? 'Free Trial' :
                       transaction.transaction_type === 'subscription_reset' ? 'Period Reset' :
                       'Adjustment'}
                    </Text>
                    <Text style={styles.transactionDate}>
                      {new Date(transaction.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={[
                    styles.transactionMinutes,
                    transaction.minutes > 0 && styles.transactionMinutesUsed
                  ]}>
                    {transaction.minutes > 0 ? `-${transaction.minutes}` : transaction.minutes} min
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
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
    gap: 16,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
  },
  refreshButton: {
    padding: 8,
  },
  refreshText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  statusCard: {
    marginTop: 20,
    padding: 24,
    borderRadius: 16,
    borderWidth: 2,
  },
  statusCardActive: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  statusCardTrial: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  statusCardInactive: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeTrial: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
  },
  statusBadgeInactive: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },
  statusBadgeText: {
    color: "#10B981",
    fontSize: 12,
    fontWeight: "700",
  },
  statusBadgeTextTrial: {
    color: "#F59E0B",
  },
  statusBadgeTextInactive: {
    color: Colors.error,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
  },
  statusSubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 28,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statCardWarning: {
    borderColor: Colors.warning,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.text,
  },
  statValueWarning: {
    color: Colors.warning,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
  },
  lifetimeCard: {
    marginTop: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  lifetimeLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  lifetimeValue: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
  },
  planCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  planHeaderText: {
    flex: 1,
  },
  planName: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
  planPrice: {
    fontSize: 14,
    color: Colors.accent,
    fontWeight: "600",
    marginTop: 2,
  },
  planFeatures: {
    gap: 12,
  },
  planFeature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  planFeatureText: {
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
  },
  billingCard: {
    marginTop: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  billingLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  billingValue: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.text,
  },
  billingDate: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  actions: {
    marginTop: 24,
    gap: 12,
  },
  subscribeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  subscribeButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  manageButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
    flex: 1,
  },
  transactionsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionType: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
  },
  transactionDate: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  transactionMinutes: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textMuted,
  },
  transactionMinutesUsed: {
    color: Colors.error,
  },
  bottomPadding: {
    height: 40,
  },
});

