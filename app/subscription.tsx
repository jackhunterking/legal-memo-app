/**
 * Subscription Management Screen
 * 
 * Premium paywall design with:
 * - Gradient background
 * - Animated close button (5-second delay)
 * - Large UNLIMITED text with badge
 * - Feature cards with icons
 * - Polar.sh web checkout
 * 
 * $97/month for unlimited transcription access.
 */

import { useState, useCallback, useEffect, useRef } from "react";
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
  Animated,
  Dimensions,
  Easing,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  X,
  ShieldCheck,
  CreditCard,
  Check,
  Zap,
  RefreshCw,
  Crown,
  ExternalLink,
  Infinity,
  Ban,
  Clock,
  FileText,
  Users,
  Lock,
  CheckCircle,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useUsage } from "@/contexts/UsageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { SUBSCRIPTION_PLAN } from "@/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Supabase project URL for Edge Functions
const SUPABASE_URL = "https://jaepslscnnjtowwkiudu.supabase.co";

// Polar product price IDs for production and sandbox
const POLAR_PRODUCT_PRICE_ID = process.env.EXPO_PUBLIC_POLAR_PRODUCT_PRICE_ID || "";
const POLAR_SANDBOX_PRODUCT_PRICE_ID = process.env.EXPO_PUBLIC_POLAR_SANDBOX_PRODUCT_PRICE_ID || "";

// Polar mode: "production" (default) or "sandbox"
const POLAR_MODE = process.env.EXPO_PUBLIC_POLAR_MODE || "production";
const IS_SANDBOX = POLAR_MODE === "sandbox";

// Use the appropriate product ID based on mode
const ACTIVE_PRODUCT_PRICE_ID = IS_SANDBOX ? POLAR_SANDBOX_PRODUCT_PRICE_ID : POLAR_PRODUCT_PRICE_ID;

// Close button delay in seconds
const CLOSE_BUTTON_DELAY = 5;

// Accent color for the design
const ACCENT_GREEN = "#10B981";
const ACCENT_GREEN_DARK = "#059669";

// Feature data with icons and descriptions
const FEATURES = [
  {
    icon: Ban,
    title: "Eliminate disputes",
    description: "Refer back to the exact moment a client agreed to the terms.",
  },
  {
    icon: Clock,
    title: "Recover billable hours",
    description: "Automated duration tracking ensures you bill for every minute.",
  },
  {
    icon: FileText,
    title: "Instant meeting summaries",
    description: "Stop taking notes. Get accurate transcripts & summaries instantly.",
  },
  {
    icon: Users,
    title: "Exact speaker attribution",
    description: "See exactly who said what, when it was said, and in what context.",
  },
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user, session } = useAuth();
  const { 
    subscription,
    isLoading: usageLoading, 
    refreshUsage,
    refreshSubscription,
    hasActiveSubscription,
    hasActiveTrial,
    isTrialExpired,
    trialDaysRemaining,
  } = useUsage();
  
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refresh subscription data when screen comes into focus
  // This ensures the UI reflects the latest subscription status after checkout
  useFocusEffect(
    useCallback(() => {
      console.log('[Subscription] Screen focused, refreshing subscription data...');
      refreshSubscription();
    }, [refreshSubscription])
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [closeButtonEnabled, setCloseButtonEnabled] = useState(false);
  const [countdown, setCountdown] = useState(CLOSE_BUTTON_DELAY);
  
  // Animation for the close button ring
  const progressAnim = useRef(new Animated.Value(0)).current;
  
  // Animation for the CTA button
  const ctaScaleAnim = useRef(new Animated.Value(1)).current;
  const ctaGlowAnim = useRef(new Animated.Value(0)).current;
  
  // Animation for the UNLIMITED text
  const unlimitedScaleAnim = useRef(new Animated.Value(1)).current;

  const isLoading = usageLoading;
  const hasProEntitlement = hasActiveSubscription;

  // Close button countdown and animation
  useEffect(() => {
    if (!hasProEntitlement) {
      // Start the countdown
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setCloseButtonEnabled(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Animate the progress ring
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: CLOSE_BUTTON_DELAY * 1000,
        useNativeDriver: false,
      }).start();

      return () => clearInterval(interval);
    } else {
      // Subscribers can close immediately
      setCloseButtonEnabled(true);
    }
  }, [hasProEntitlement]);

  // CTA button micro-animation
  useEffect(() => {
    if (!hasProEntitlement) {
      // Subtle pulse animation
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(ctaScaleAnim, {
              toValue: 1.02,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(ctaGlowAnim, {
              toValue: 1,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false,
            }),
          ]),
          Animated.parallel([
            Animated.timing(ctaScaleAnim, {
              toValue: 1,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(ctaGlowAnim, {
              toValue: 0,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false,
            }),
          ]),
        ])
      );
      pulseAnimation.start();

      return () => pulseAnimation.stop();
    }
  }, [hasProEntitlement]);

  // UNLIMITED text micro-animation
  useEffect(() => {
    if (!hasProEntitlement) {
      // Subtle pulse animation for UNLIMITED text
      const unlimitedPulse = Animated.loop(
        Animated.sequence([
          Animated.timing(unlimitedScaleAnim, {
            toValue: 1.015,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(unlimitedScaleAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      unlimitedPulse.start();

      return () => unlimitedPulse.stop();
    }
  }, [hasProEntitlement]);

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
   * Handle close button press
   */
  const handleClose = useCallback(() => {
    if (!closeButtonEnabled && !hasProEntitlement) return;
    
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  }, [closeButtonEnabled, hasProEntitlement, router]);

  /**
   * Show Apple-required disclosure and then open Polar checkout
   */
  const handleSubscribe = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // Apple requires disclosure before linking to external payment
    Alert.alert(
      "Start Your Free Trial",
      `You'll be redirected to our secure checkout.\n\n${SUBSCRIPTION_PLAN.freeTrialDays}-day free trial, then $${SUBSCRIPTION_PLAN.priceMonthly}/month.\n\nPayment is processed securely outside the app.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Continue",
          style: "default",
          onPress: () => openPolarCheckout(),
        },
      ]
    );
  }, [session]);

  /**
   * Build Polar checkout URL and open in Safari
   */
  const openPolarCheckout = async () => {
    setIsProcessing(true);

    try {
      console.log('[Subscription] Building Polar checkout URL...');
      console.log('[Subscription] Mode:', POLAR_MODE);
      console.log('[Subscription] Is Sandbox:', IS_SANDBOX);
      
      const priceId = ACTIVE_PRODUCT_PRICE_ID;
      if (!priceId) {
        const missingVar = IS_SANDBOX 
          ? 'EXPO_PUBLIC_POLAR_SANDBOX_PRODUCT_PRICE_ID' 
          : 'EXPO_PUBLIC_POLAR_PRODUCT_PRICE_ID';
        throw new Error(`Product not configured. Please set ${missingVar}`);
      }
      
      console.log('[Subscription] Using product ID:', priceId);

      const params = new URLSearchParams({
        products: priceId,
      });

      if (user?.email) {
        params.set('customerEmail', user.email);
      }
      
      if (user?.id) {
        params.set('customerExternalId', user.id);
        const metadata = JSON.stringify({ supabase_user_id: user.id });
        params.set('metadata', metadata);
      }

      const checkoutUrl = `${SUPABASE_URL}/functions/v1/polar-checkout?${params.toString()}`;
      console.log('[Subscription] Opening checkout URL:', checkoutUrl);
      
      const canOpen = await Linking.canOpenURL(checkoutUrl);
      if (canOpen) {
        await Linking.openURL(checkoutUrl);
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

    setIsProcessing(true);

    try {
      console.log('[Subscription] Opening customer portal...');
      
      const polarCustomerId = subscription?.polar_customer_id;
      
      if (!polarCustomerId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('polar_customer_id')
          .eq('id', user?.id)
          .single();
          
        if (!profile?.polar_customer_id) {
          throw new Error('No subscription found');
        }
        
        const portalUrl = `${SUPABASE_URL}/functions/v1/polar-customer-portal?customerId=${encodeURIComponent(profile.polar_customer_id)}`;
        const canOpen = await Linking.canOpenURL(portalUrl);
        if (canOpen) {
          await Linking.openURL(portalUrl);
        }
        return;
      }

      const portalUrl = `${SUPABASE_URL}/functions/v1/polar-customer-portal?customerId=${encodeURIComponent(polarCustomerId)}`;
      console.log('[Subscription] Opening portal URL:', portalUrl);
      
      const canOpen = await Linking.canOpenURL(portalUrl);
      if (canOpen) {
        await Linking.openURL(portalUrl);
      } else {
        Alert.alert(
          "Manage Subscription",
          "Unable to open subscription management. Please try again later.",
          [{ text: "OK", style: "default" }]
        );
      }
    } catch (error) {
      console.error('[Subscription] Error opening portal:', error);
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Unable to open subscription management. Please try again.",
        [{ text: "OK", style: "default" }]
      );
    } finally {
      setIsProcessing(false);
    }
  }, [subscription?.polar_customer_id, user?.id]);

  /**
   * Handle restore purchase
   */
  const handleRestorePurchase = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    setIsRefreshing(true);
    await refreshUsage();
    setIsRefreshing(false);
    
    if (hasActiveSubscription) {
      Alert.alert("Success", "Your subscription has been restored.", [{ text: "OK" }]);
    } else {
      Alert.alert(
        "No Subscription Found",
        "We couldn't find an active subscription for your account. If you believe this is an error, please contact support.",
        [{ text: "OK" }]
      );
    }
  }, [refreshUsage, hasActiveSubscription]);

  /**
   * Handle terms link
   */
  const handleTerms = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Linking.openURL("https://legalmemo.app/terms");
  }, []);

  /**
   * Handle privacy link
   */
  const handlePrivacy = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Linking.openURL("https://legalmemo.app/privacy");
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <LinearGradient
        colors={["#061f18", "#051a14", "#08080e"]}
        style={styles.container}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <SafeAreaView style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={ACCENT_GREEN} />
            <Text style={styles.loadingText}>Loading subscription info...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Get subscription expiration date if available
  const expirationDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end)
    : null;

  // Calculate progress for the animated ring
  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 0],
  });

  return (
    <LinearGradient
      colors={["#061f18", "#051a14", "#08080e"]}
      style={styles.container}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        {/* Close Button with Animated Ring */}
        <View style={styles.closeButtonContainer}>
          <Pressable
            style={[
              styles.closeButton,
              !closeButtonEnabled && !hasProEntitlement && styles.closeButtonDisabled,
            ]}
            onPress={handleClose}
            disabled={!closeButtonEnabled && !hasProEntitlement}
          >
            {!hasProEntitlement && !closeButtonEnabled && (
              <View style={styles.countdownRing}>
                <Animated.View
                  style={[
                    styles.countdownProgress,
                    {
                      transform: [
                        {
                          rotate: progressAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ["0deg", "360deg"],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                <Text style={styles.countdownText}>{countdown}</Text>
              </View>
            )}
            {(hasProEntitlement || closeButtonEnabled) && (
              <X size={24} color={Colors.text} />
            )}
          </Pressable>
        </View>

        {/* Sandbox Mode Indicator */}
        {IS_SANDBOX && (
          <View style={styles.sandboxBanner}>
            <Text style={styles.sandboxBannerText}>🧪 SANDBOX MODE</Text>
          </View>
        )}

        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Subscriber View */}
          {hasProEntitlement ? (
            <View style={styles.subscriberContent}>
              {/* Shield Icon */}
              <View style={styles.shieldContainer}>
                <LinearGradient
                  colors={[ACCENT_GREEN, ACCENT_GREEN_DARK]}
                  style={styles.shieldGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <ShieldCheck size={40} color="#fff" />
                </LinearGradient>
              </View>

              {/* Hero Text */}
              <Text style={styles.heroTitle}>Unlimited Access Active</Text>
              <Text style={styles.heroSubtitle}>Thank you for subscribing</Text>

              {/* Status Badge */}
              <View style={styles.proBadge}>
                <Crown size={16} color="#FFD700" />
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>

              {/* Unlimited Card */}
              <View style={styles.unlimitedCard}>
                <View style={styles.unlimitedBadge}>
                  <Text style={styles.unlimitedBadgeText}>Active Subscription</Text>
                </View>
                <View style={styles.unlimitedContent}>
                  <Text style={styles.unlimitedTitle}>UNLIMITED</Text>
                  <View style={styles.unlimitedSubtitleRow}>
                    <Infinity size={18} color={ACCENT_GREEN} />
                    <Text style={styles.unlimitedSubtitle}>RECORDING & TRANSCRIPTION</Text>
                  </View>
                  {expirationDate && (
                    <Text style={styles.renewalText}>
                      Renews {expirationDate.toLocaleDateString()}
                    </Text>
                  )}
                </View>
              </View>

              {/* Manage Button */}
              <Pressable
                style={styles.manageButton}
                onPress={handleManageSubscription}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <>
                    <CreditCard size={20} color={Colors.text} />
                    <Text style={styles.manageButtonText}>Manage Subscription</Text>
                    <ExternalLink size={16} color={Colors.textMuted} />
                  </>
                )}
              </Pressable>

              {/* Refresh Button */}
              <Pressable
                style={styles.refreshButton}
                onPress={handleRefresh}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <ActivityIndicator size="small" color={Colors.textMuted} />
                ) : (
                  <>
                    <RefreshCw size={18} color={Colors.textMuted} />
                    <Text style={styles.refreshButtonText}>Refresh Status</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : (
            /* Non-Subscriber View */
            <View style={styles.paywallContent}>
              {/* Shield Icon */}
              <View style={styles.shieldContainer}>
                <LinearGradient
                  colors={[ACCENT_GREEN, ACCENT_GREEN_DARK]}
                  style={styles.shieldGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <ShieldCheck size={34} color="#fff" />
                </LinearGradient>
              </View>

              {/* Hero Text */}
              <Text style={styles.heroTitle}>Protect Your Practice</Text>
              <Text style={styles.heroSubtitle}>Trusted by 500+ Legal Professionals</Text>

              {/* Unlimited Card with Badge */}
              <View style={styles.unlimitedCard}>
                <View style={styles.unlimitedBadge}>
                  <Text style={styles.unlimitedBadgeText}>{SUBSCRIPTION_PLAN.freeTrialDays}-Day Free Trial</Text>
                </View>
                <View style={styles.unlimitedContent}>
                  <Animated.Text 
                    style={[
                      styles.unlimitedTitle,
                      {
                        transform: [{ scale: unlimitedScaleAnim }],
                      },
                    ]}
                  >
                    UNLIMITED
                  </Animated.Text>
                  <View style={styles.unlimitedSubtitleRow}>
                    <Infinity size={18} color={ACCENT_GREEN} />
                    <Text style={styles.unlimitedSubtitle}>RECORDING & TRANSCRIPTION</Text>
                  </View>
                  <View style={styles.pricingRow}>
                    <Text style={styles.pricingText}>
                      Free for {SUBSCRIPTION_PLAN.freeTrialDays} days, then auto-renews for{" "}
                    </Text>
                    <Text style={styles.priceHighlight}>${SUBSCRIPTION_PLAN.priceMonthly}/month</Text>
                  </View>
                </View>
              </View>

              {/* Features */}
              <View style={styles.featuresContainer}>
                {FEATURES.map((feature, index) => (
                  <View key={index} style={styles.featureCard}>
                    <View style={styles.featureIconContainer}>
                      <feature.icon size={20} color={ACCENT_GREEN} />
                    </View>
                    <View style={styles.featureTextContainer}>
                      <Text style={styles.featureTitle}>{feature.title}</Text>
                      <Text style={styles.featureDescription}>{feature.description}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* CTA Button */}
              <Animated.View
                style={[
                  styles.ctaButtonContainer,
                  {
                    transform: [{ scale: ctaScaleAnim }],
                  },
                ]}
              >
                <Pressable
                  style={[styles.ctaButton, isProcessing && styles.ctaButtonDisabled]}
                  onPress={handleSubscribe}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={styles.ctaButtonText}>
                      Start {SUBSCRIPTION_PLAN.freeTrialDays}-Day Free Trial
                    </Text>
                  )}
                </Pressable>
              </Animated.View>

              {/* Disclaimers */}
              <View style={styles.disclaimersRow}>
                <View style={styles.disclaimerItem}>
                  <CheckCircle size={14} color={ACCENT_GREEN} />
                  <Text style={styles.disclaimerText}>NO PAYMENT TODAY</Text>
                </View>
                <View style={styles.disclaimerDivider} />
                <View style={styles.disclaimerItem}>
                  <Lock size={14} color={ACCENT_GREEN} />
                  <Text style={styles.disclaimerText}>ENCRYPTED DATA USE</Text>
                </View>
              </View>

              {/* Footer Links */}
              <View style={styles.footerLinks}>
                <Pressable onPress={handleRestorePurchase} disabled={isRefreshing}>
                  <Text style={styles.footerLinkText}>
                    {isRefreshing ? "Restoring..." : "Restore Purchase"}
                  </Text>
                </Pressable>
                <Text style={styles.footerDivider}>|</Text>
                <Pressable onPress={handleTerms}>
                  <Text style={styles.footerLinkText}>Terms</Text>
                </Pressable>
                <Text style={styles.footerDivider}>|</Text>
                <Pressable onPress={handlePrivacy}>
                  <Text style={styles.footerLinkText}>Privacy</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sandboxBanner: {
    backgroundColor: "#F59E0B",
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: "center",
    marginTop: Platform.OS === "ios" ? 50 : 10,
  },
  sandboxBannerText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
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
  closeButtonContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 20,
    right: 20,
    zIndex: 100,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  countdownRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  countdownProgress: {
    position: "absolute",
    top: -2,
    left: -2,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: ACCENT_GREEN,
    borderTopColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "transparent",
  },
  countdownText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
  },
  // Subscriber View
  subscriberContent: {
    alignItems: "center",
  },
  proBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
  },
  proBadgeText: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: "100%",
    marginTop: 24,
  },
  manageButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
    flex: 1,
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 12,
  },
  refreshButtonText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: "500",
  },
  renewalText: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  // Paywall (Non-Subscriber) View
  paywallContent: {
    alignItems: "center",
  },
  shieldContainer: {
    marginBottom: 12,
  },
  shieldGradient: {
    width: 68,
    height: 68,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 18,
  },
  unlimitedCard: {
    width: "100%",
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(16, 185, 129, 0.3)",
    marginBottom: 18,
    position: "relative",
    paddingTop: 24,
  },
  unlimitedBadge: {
    position: "absolute",
    top: -12,
    alignSelf: "center",
    backgroundColor: ACCENT_GREEN,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 18,
  },
  unlimitedBadgeText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  unlimitedContent: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  unlimitedTitle: {
    fontSize: 42,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: 2,
    marginBottom: 6,
  },
  unlimitedSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  unlimitedSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: ACCENT_GREEN,
    letterSpacing: 1,
  },
  pricingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
  },
  pricingText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  priceHighlight: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
  },
  featuresContainer: {
    width: "100%",
    gap: 8,
    marginBottom: 18,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  featureIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  ctaButtonContainer: {
    width: "100%",
    marginBottom: 12,
  },
  ctaButton: {
    width: "100%",
    backgroundColor: ACCENT_GREEN,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaButtonDisabled: {
    opacity: 0.7,
  },
  ctaButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#000",
  },
  disclaimersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  disclaimerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  disclaimerText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
  disclaimerDivider: {
    width: 1,
    height: 12,
    backgroundColor: ACCENT_GREEN,
    marginHorizontal: 10,
    opacity: 0.3,
  },
  footerLinks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  footerLinkText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  footerDivider: {
    color: Colors.textMuted,
    opacity: 0.3,
  },
});
