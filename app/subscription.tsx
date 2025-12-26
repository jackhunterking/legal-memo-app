/**
 * Subscription Management Screen
 * 
 * Uses Polar.sh for web-based checkout (opens in Safari).
 * $97/month for unlimited transcription access.
 * 
 * Features:
 * - Web checkout via Polar.sh (opens in Safari)
 * - 7-day free trial
 * - Subscription status from Supabase
 * - Apple-required disclosure before external checkout
 */

import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  CreditCard,
  Gift,
  Check,
  Zap,
  RefreshCw,
  Crown,
  ExternalLink,
  Info,
  Infinity,
  Mic,
  Users,
  FileText,
  Share2,
  Shield,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useUsage } from "@/contexts/UsageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { SUBSCRIPTION_PLAN } from "@/types";

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user, session } = useAuth();
  const { 
    subscription,
    isLoading: usageLoading, 
    refreshUsage,
    hasActiveSubscription,
  } = useUsage();
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const isLoading = usageLoading;
  const hasProEntitlement = hasActiveSubscription;

  /**
   * Refresh subscription data
   */
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    await refreshUsage();
    
    setIsRefreshing(false);
  }, [refreshUsage]);

  /**
   * Show Apple-required disclosure and then open Polar checkout
   */
  const handleSubscribe = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // Apple requires disclosure before linking to external payment
    Alert.alert(
      "External Purchase",
      `You will be redirected to our secure checkout page to start your ${SUBSCRIPTION_PLAN.freeTrialDays}-day free trial.\n\nAfter the trial, you'll be charged $${SUBSCRIPTION_PLAN.priceMonthly}/month for unlimited access.\n\nThis purchase is not made through Apple and is not covered by Apple's refund policy.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Start Free Trial",
          style: "default",
          onPress: () => openPolarCheckout(),
        },
      ]
    );
  }, [session]);

  /**
   * Create Polar checkout session and open in Safari
   */
  const openPolarCheckout = async () => {
    setIsProcessing(true);

    try {
      console.log('[Subscription] Creating Polar checkout session...');
      
      // Call our Edge Function to create a checkout session
      const { data, error } = await supabase.functions.invoke('create-polar-checkout', {
        body: {},
      });

      if (error) {
        console.error('[Subscription] Checkout error:', error);
        throw new Error(error.message || 'Failed to create checkout');
      }

      if (!data?.checkout_url) {
        throw new Error('No checkout URL returned');
      }

      console.log('[Subscription] Opening checkout URL:', data.checkout_url);
      
      // Open in Safari (external browser)
      const canOpen = await Linking.canOpenURL(data.checkout_url);
      if (canOpen) {
        await Linking.openURL(data.checkout_url);
      } else {
        throw new Error('Cannot open checkout URL');
      }

    } catch (error) {
      console.error('[Subscription] Error:', error);
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Unable to start checkout. Please try again.",
        [{ text: "OK", style: "default" }]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Open Polar customer portal for subscription management
   */
  const handleManageSubscription = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Open Polar customer portal
    const portalUrl = "https://polar.sh/legal-memo/portal";
    
    try {
      const canOpen = await Linking.canOpenURL(portalUrl);
      if (canOpen) {
        await Linking.openURL(portalUrl);
      } else {
        Alert.alert(
          "Manage Subscription",
          "To manage your subscription, visit polar.sh/legal-memo/portal in your web browser.",
          [{ text: "OK", style: "default" }]
        );
      }
    } catch (error) {
      console.error('[Subscription] Error opening portal:', error);
      Alert.alert(
        "Error",
        "Unable to open subscription management. Please try again.",
        [{ text: "OK", style: "default" }]
      );
    }
  }, []);

  // Loading state
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

  // Get subscription expiration date if available
  const expirationDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end)
    : null;

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
            <RefreshCw size={20} color={Colors.accent} />
          )}
        </Pressable>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={[
          styles.statusCard,
          hasProEntitlement ? styles.statusCardActive : styles.statusCardInactive
        ]}>
          <View style={styles.statusHeader}>
            {hasProEntitlement ? (
              <>
                <View style={styles.statusBadge}>
                  <Crown size={16} color="#FFD700" />
                  <Text style={styles.statusBadgeText}>Pro</Text>
                </View>
                <Text style={styles.statusTitle}>{SUBSCRIPTION_PLAN.name}</Text>
              </>
            ) : (
              <>
                <View style={[styles.statusBadge, styles.statusBadgeInactive]}>
                  <Gift size={16} color={Colors.accent} />
                  <Text style={[styles.statusBadgeText, styles.statusBadgeTextInactive]}>
                    {SUBSCRIPTION_PLAN.freeTrialDays}-Day Free Trial
                  </Text>
                </View>
                <Text style={styles.statusTitle}>Start Your Trial</Text>
              </>
            )}
          </View>
          
          {hasProEntitlement ? (
            <>
              <View style={styles.unlimitedBadge}>
                <Infinity size={20} color={Colors.success} />
                <Text style={styles.unlimitedText}>Unlimited Access Active</Text>
              </View>
              {expirationDate && (
                <Text style={styles.statusSubtitle}>
                  Renews {expirationDate.toLocaleDateString()}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.statusSubtitle}>
              Try all features free for {SUBSCRIPTION_PLAN.freeTrialDays} days
            </Text>
          )}
        </View>

        {/* Pricing Card - only show for non-subscribers */}
        {!hasProEntitlement && (
          <View style={styles.pricingCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceAmount}>${SUBSCRIPTION_PLAN.priceMonthly}</Text>
              <Text style={styles.pricePeriod}>/month</Text>
            </View>
            <Text style={styles.priceSubtext}>After {SUBSCRIPTION_PLAN.freeTrialDays}-day free trial</Text>
          </View>
        )}

        {/* Features */}
        <Text style={styles.sectionTitle}>What's Included</Text>
        <View style={styles.featuresCard}>
          {SUBSCRIPTION_PLAN.features.map((feature, index) => {
            const icons = [Infinity, Mic, Users, FileText, Share2, Shield];
            const Icon = icons[index] || Check;
            return (
              <View key={index} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Icon size={20} color={Colors.accent} />
                </View>
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            );
          })}
        </View>

        {/* Billing Period - only show for subscribers */}
        {hasProEntitlement && expirationDate && (
          <View style={styles.billingCard}>
            <Text style={styles.billingLabel}>Current Billing Period</Text>
            <Text style={styles.billingValue}>
              Renews on {expirationDate.toLocaleDateString()}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          {hasProEntitlement ? (
            <Pressable
              style={styles.manageButton}
              onPress={handleManageSubscription}
              disabled={isProcessing}
            >
              <CreditCard size={20} color={Colors.text} />
              <Text style={styles.manageButtonText}>Manage Subscription</Text>
              <ExternalLink size={16} color={Colors.textMuted} />
            </Pressable>
          ) : (
            <>
              <Pressable
                style={styles.subscribeButton}
                onPress={handleSubscribe}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <Zap size={20} color="#000" />
                    <Text style={styles.subscribeButtonText}>
                      Start {SUBSCRIPTION_PLAN.freeTrialDays}-Day Free Trial
                    </Text>
                    <ExternalLink size={16} color="#000" />
                  </>
                )}
              </Pressable>
              
              {/* Apple disclosure notice */}
              <View style={styles.disclosureCard}>
                <Info size={16} color={Colors.textMuted} />
                <Text style={styles.disclosureText}>
                  Your subscription will be processed through our secure web checkout. 
                  Cancel anytime during your free trial and you won't be charged.
                  This is not an in-app purchase and is not covered by Apple's refund policy.
                </Text>
              </View>
            </>
          )}
        </View>

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
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  statusCardInactive: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderColor: "rgba(59, 130, 246, 0.3)",
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
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeInactive: {
    backgroundColor: "rgba(59, 130, 246, 0.2)",
  },
  statusBadgeText: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "700",
  },
  statusBadgeTextInactive: {
    color: Colors.accent,
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
  unlimitedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  unlimitedText: {
    color: Colors.success,
    fontSize: 14,
    fontWeight: "600",
  },
  pricingCard: {
    marginTop: 20,
    padding: 24,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  priceAmount: {
    fontSize: 48,
    fontWeight: "800",
    color: Colors.text,
  },
  pricePeriod: {
    fontSize: 18,
    fontWeight: "500",
    color: Colors.textMuted,
    marginLeft: 4,
  },
  priceSubtext: {
    marginTop: 4,
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
  featuresCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 16,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 15,
    color: Colors.text,
    flex: 1,
  },
  billingCard: {
    marginTop: 20,
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
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
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
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  subscribeButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#000",
    flex: 1,
    textAlign: "center",
  },
  disclosureCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  disclosureText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
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
  bottomPadding: {
    height: 40,
  },
});
