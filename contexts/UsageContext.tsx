/**
 * UsageContext
 * 
 * Manages subscription status and time-based trial tracking for Polar billing.
 * Uses @polar-sh/supabase SDK for payment integration.
 * 
 * Business Model:
 * - 7-day free trial with UNLIMITED usage during trial period
 * - After trial: $97/month for unlimited access
 * - Paywalls appear when trial expires and no subscription
 * 
 * Provides hooks to:
 * - Check if user can record (has active trial OR subscription)
 * - Check if user can access features (meetings, audio, etc.)
 * - Get trial status and countdown
 * - Get subscription details from Supabase
 * - Refresh usage after recording
 * - Refresh subscription after Polar checkout success
 */

import createContextHook from '@nkzw/create-context-hook';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import type { 
  Subscription, 
  UsageCredits, 
  UsageTransaction, 
  UsageState, 
  CanRecordResult,
  CanAccessResult,
  CancellationReason,
  CancellationDisplayInfo,
} from '@/types';
import { 
  getDaysRemainingInPeriod,
  getTrialExpirationDate,
  isTrialActive,
  getTrialDaysRemaining,
  formatTrialStatusMessage,
  SUBSCRIPTION_PLAN,
  isSubscriptionActive,
  isCanceled,
  isCanceledButStillActive,
  getCancellationDisplayInfo,
  getCancellationReasonMessage,
} from '@/types';

export const [UsageProvider, useUsage] = createContextHook(() => {
  // useRef must be called first to maintain consistent hook order
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  // ============================================
  // APP STATE LISTENER - Refresh data when app comes to foreground
  // ============================================
  
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // When app comes back from background to active, refresh usage data
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        user?.id
      ) {
        console.log('[UsageContext] App became active, refreshing usage data...');
        // Invalidate and refetch all usage-related queries
        queryClient.invalidateQueries({ queryKey: ['subscription', user.id] });
        queryClient.invalidateQueries({ queryKey: ['usageCredits', user.id] });
        queryClient.invalidateQueries({ queryKey: ['canRecord', user.id] });
        queryClient.invalidateQueries({ queryKey: ['canAccess', user.id] });
        queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [user?.id, queryClient]);

  // ============================================
  // SUBSCRIPTION QUERY
  // ============================================
  
  const subscriptionQuery = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: async (): Promise<Subscription | null> => {
      if (!user?.id) return null;
      console.log('[UsageContext] Fetching subscription...');
      
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error) {
        // No subscription found is not an error
        if (error.code === 'PGRST116') {
          console.log('[UsageContext] No subscription found');
          return null;
        }
        console.error('[UsageContext] Error fetching subscription:', error.message);
        return null;
      }
      
      console.log('[UsageContext] Subscription found:', data.status);
      return data;
    },
    enabled: !!user?.id,
  });

  // ============================================
  // USAGE CREDITS QUERY (for lifetime stats)
  // ============================================
  
  const usageCreditsQuery = useQuery({
    queryKey: ['usageCredits', user?.id],
    queryFn: async (): Promise<UsageCredits | null> => {
      if (!user?.id) return null;
      console.log('[UsageContext] Fetching usage credits...');
      
      const { data, error } = await supabase
        .from('usage_credits')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          console.log('[UsageContext] No usage credits record found');
          return null;
        }
        console.error('[UsageContext] Error fetching usage credits:', error.message);
        return null;
      }
      
      console.log('[UsageContext] Usage credits:', data.lifetime_minutes_used);
      return data;
    },
    enabled: !!user?.id,
  });

  // ============================================
  // CAN RECORD CHECK (using database function)
  // Now uses time-based trial instead of minutes
  // ============================================
  
  const canRecordQuery = useQuery({
    queryKey: ['canRecord', user?.id],
    queryFn: async (): Promise<CanRecordResult | null> => {
      if (!user?.id) return null;
      console.log('[UsageContext] Checking if user can record (time-based trial)...');
      
      const { data, error } = await supabase.rpc('can_user_record', {
        p_user_id: user.id,
      });
      
      if (error) {
        console.error('[UsageContext] Error checking can_record:', error.message);
        // Default to allowing if check fails - calculate from profile
        const trialStartedAt = profile?.trial_started_at || profile?.created_at;
        const trialActive = isTrialActive(trialStartedAt);
        const daysRemaining = getTrialDaysRemaining(trialStartedAt);
        const expiresAt = getTrialExpirationDate(trialStartedAt);
        
        return {
          can_record: trialActive,
          has_active_trial: trialActive,
          trial_started_at: trialStartedAt || null,
          trial_expires_at: expiresAt?.toISOString() || null,
          trial_days_remaining: daysRemaining,
          has_subscription: false,
          subscription_status: null,
          // Cancellation fields (default to not canceled)
          is_canceling: false,
          canceled_but_active: false,
          canceled_at: null,
          cancellation_reason: null,
          access_ends_at: null,
          days_until_access_ends: 0,
          current_period_end: null,
          reason: trialActive ? 'active_trial' : 'trial_expired',
        };
      }
      
      console.log('[UsageContext] Can record result:', data);
      return data as CanRecordResult;
    },
    enabled: !!user?.id,
    // Refresh frequently to stay up to date
    staleTime: 30000, // Consider stale after 30 seconds
  });

  // ============================================
  // CAN ACCESS FEATURES CHECK
  // Used for meeting details, audio playback, etc.
  // ============================================
  
  const canAccessQuery = useQuery({
    queryKey: ['canAccess', user?.id],
    queryFn: async (): Promise<CanAccessResult | null> => {
      if (!user?.id) return null;
      console.log('[UsageContext] Checking if user can access features...');
      
      const { data, error } = await supabase.rpc('can_access_features', {
        p_user_id: user.id,
      });
      
      if (error) {
        console.error('[UsageContext] Error checking can_access:', error.message);
        // Default - calculate from profile
        const trialStartedAt = profile?.trial_started_at || profile?.created_at;
        const trialActive = isTrialActive(trialStartedAt);
        const daysRemaining = getTrialDaysRemaining(trialStartedAt);
        const expiresAt = getTrialExpirationDate(trialStartedAt);
        
        return {
          can_access: trialActive,
          has_active_trial: trialActive,
          trial_started_at: trialStartedAt || null,
          trial_expires_at: expiresAt?.toISOString() || null,
          trial_days_remaining: daysRemaining,
          has_subscription: false,
          subscription_status: null,
          // Cancellation fields (default to not canceled)
          is_canceling: false,
          canceled_but_active: false,
          canceled_at: null,
          cancellation_reason: null,
          access_ends_at: null,
          days_until_access_ends: 0,
          current_period_end: null,
          reason: trialActive ? 'active_trial' : 'trial_expired',
        };
      }
      
      console.log('[UsageContext] Can access result:', data);
      return data as CanAccessResult;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  // ============================================
  // USAGE TRANSACTIONS QUERY (recent history)
  // ============================================
  
  const transactionsQuery = useQuery({
    queryKey: ['usageTransactions', user?.id],
    queryFn: async (): Promise<UsageTransaction[]> => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('usage_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) {
        console.error('[UsageContext] Error fetching transactions:', error.message);
        return [];
      }
      
      return data || [];
    },
    enabled: !!user?.id,
  });

  // ============================================
  // COMPUTED USAGE STATE (Time-based Trial)
  // ============================================
  
  const computeUsageState = (): UsageState => {
    const subscription = subscriptionQuery.data;
    const usageCredits = usageCreditsQuery.data;
    const canRecordResult = canRecordQuery.data;
    const canAccessResult = canAccessQuery.data;
    
    const hasActiveSubscription = isSubscriptionActive(subscription?.status);
    
    // Time-based trial calculations
    const trialStartedAt = canRecordResult?.trial_started_at 
      ? new Date(canRecordResult.trial_started_at) 
      : (profile?.trial_started_at ? new Date(profile.trial_started_at) : null);
    
    const trialExpiresAt = canRecordResult?.trial_expires_at
      ? new Date(canRecordResult.trial_expires_at)
      : getTrialExpirationDate(trialStartedAt);
    
    const trialDaysRemaining = canRecordResult?.trial_days_remaining ?? getTrialDaysRemaining(trialStartedAt);
    const hasActiveTrial = canRecordResult?.has_active_trial ?? isTrialActive(trialStartedAt);
    
    // Cancellation status - from database function or derived from subscription
    const isCancelingFromDb = canRecordResult?.is_canceling ?? false;
    const canceledButActiveFromDb = canRecordResult?.canceled_but_active ?? false;
    
    // Use database result, fall back to helper function if not available
    const isCancelingState = isCancelingFromDb || isCanceled(subscription?.status);
    const canceledButActiveState = canceledButActiveFromDb || isCanceledButStillActive(subscription);
    
    // Cancellation dates
    const canceledAt = canRecordResult?.canceled_at 
      ? new Date(canRecordResult.canceled_at) 
      : (subscription?.canceled_at ? new Date(subscription.canceled_at) : null);
    
    const cancellationReason = (canRecordResult?.cancellation_reason || subscription?.cancellation_reason) as CancellationReason | null;
    
    const accessEndsAt = canRecordResult?.access_ends_at 
      ? new Date(canRecordResult.access_ends_at) 
      : (subscription?.current_period_end ? new Date(subscription.current_period_end) : null);
    
    const daysUntilAccessEnds = canRecordResult?.days_until_access_ends ?? 0;
    
    // Consider canceled-but-active users as still having subscription access
    const effectiveHasSubscription = hasActiveSubscription || canceledButActiveState;
    const isTrialExpired = !hasActiveTrial && !effectiveHasSubscription;
    
    // Subscription period dates (for subscribers)
    const periodStart = usageCredits?.period_start ? new Date(usageCredits.period_start) : null;
    const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
    const daysRemainingInPeriod = getDaysRemainingInPeriod(periodEnd);
    
    // Access checks - include canceled-but-active users
    const canRecord = canRecordResult?.can_record ?? (hasActiveTrial || effectiveHasSubscription);
    const canAccessFeatures = canAccessResult?.can_access ?? (hasActiveTrial || effectiveHasSubscription);
    const accessReason = canRecordResult?.reason ?? (
      hasActiveSubscription ? 'active_subscription' : 
      canceledButActiveState ? 'canceled_but_active' :
      hasActiveTrial ? 'active_trial' : 
      'trial_expired'
    );
    
    return {
      hasActiveSubscription: effectiveHasSubscription,
      subscription,
      
      // Time-based trial info
      hasActiveTrial,
      trialStartedAt,
      trialExpiresAt,
      trialDaysRemaining,
      isTrialExpired,
      
      // Cancellation status
      isCanceling: isCancelingState,
      canceledButStillActive: canceledButActiveState,
      canceledAt,
      cancellationReason,
      accessEndsAt,
      daysUntilAccessEnds,
      
      // Lifetime stats
      lifetimeMinutesUsed: usageCredits?.lifetime_minutes_used ?? 0,
      
      // Subscription period dates
      periodStart,
      periodEnd,
      daysRemainingInPeriod,
      
      // Access checks
      canRecord,
      canAccessFeatures,
      accessReason,
    };
  };

  const usageState = computeUsageState();

  // ============================================
  // REFRESH FUNCTIONS
  // ============================================
  
  const refreshUsage = async () => {
    console.log('[UsageContext] Refreshing usage data...');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['subscription', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['usageCredits', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['canRecord', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['canAccess', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['usageTransactions', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] }),
    ]);
  };

  const refreshCanRecord = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['canRecord', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['canAccess', user?.id] }),
    ]);
  };

  /**
   * Refresh subscription data specifically (called after Polar checkout success)
   */
  const refreshSubscription = async () => {
    console.log('[UsageContext] Refreshing subscription data after checkout...');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['subscription', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['canRecord', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['canAccess', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] }),
    ]);
  };

  // ============================================
  // HELPER FUNCTIONS
  // ============================================
  
  /**
   * Check if user needs to see paywall (trial expired, no subscription)
   * IMPORTANT: Never show paywall if user has an active subscription or is in grace period
   */
  const shouldShowPaywall = (): boolean => {
    // Active subscribers should NEVER see paywalls
    if (usageState.hasActiveSubscription) return false;
    // Users with active trial should not see paywalls
    if (usageState.hasActiveTrial) return false;
    // Canceled but still active users should NOT see paywalls (grace period)
    if (usageState.canceledButStillActive) return false;
    // Only show paywall if trial expired and no subscription/grace period
    return usageState.isTrialExpired;
  };

  /**
   * Check if subscription is canceled (regardless of whether access remains)
   */
  const isSubscriptionCanceling = (): boolean => {
    return usageState.isCanceling;
  };

  /**
   * Check if user is in cancellation grace period (canceled but still has access)
   */
  const isInCancellationGracePeriod = (): boolean => {
    return usageState.canceledButStillActive;
  };

  /**
   * Get comprehensive cancellation display info for UI
   */
  const getCancellationInfo = (): CancellationDisplayInfo => {
    return getCancellationDisplayInfo(subscriptionQuery.data);
  };

  /**
   * Check if trial is ending soon (last 2 days)
   * Used to show urgency messaging
   */
  const isTrialEndingSoon = (): boolean => {
    if (usageState.hasActiveSubscription) return false;
    if (!usageState.hasActiveTrial) return false;
    return usageState.trialDaysRemaining <= 2;
  };

  /**
   * Check if user can access meeting details
   * @returns true if user has active trial or subscription
   */
  const canAccessMeetingDetails = (): boolean => {
    return usageState.canAccessFeatures;
  };

  /**
   * Check if user can start a new recording
   * @returns true if user has active trial or subscription
   */
  const canStartRecording = (): boolean => {
    return usageState.canRecord;
  };

  /**
   * Get a user-friendly message about their trial/subscription status
   */
  const getStatusMessage = (): string => {
    return formatTrialStatusMessage(
      usageState.trialStartedAt?.toISOString() || null,
      usageState.hasActiveSubscription
    );
  };

  /**
   * @deprecated Use getStatusMessage instead
   * Kept for backward compatibility
   */
  const getCreditStatusMessage = (): string => {
    return getStatusMessage();
  };

  /**
   * @deprecated Trial is now unlimited during trial period
   * Kept for backward compatibility - always returns false
   */
  const isLowOnCredits = (): boolean => {
    // With time-based trial, there's no "low on credits" state
    // Instead, use isTrialEndingSoon() for urgency
    return false;
  };

  /**
   * @deprecated Trial is now unlimited during trial period
   * Kept for backward compatibility
   */
  const getAvailableMinutes = (): number => {
    if (usageState.hasActiveSubscription || usageState.hasActiveTrial) {
      return Infinity; // Unlimited during trial and subscription
    }
    return 0;
  };

  return {
    // Raw data
    subscription: subscriptionQuery.data,
    usageCredits: usageCreditsQuery.data,
    transactions: transactionsQuery.data || [],
    
    // Computed state
    usageState,
    
    // Loading states
    isLoading: subscriptionQuery.isLoading || usageCreditsQuery.isLoading || canRecordQuery.isLoading,
    isRefreshing: subscriptionQuery.isRefetching || usageCreditsQuery.isRefetching,
    
    // Convenience booleans
    hasActiveSubscription: usageState.hasActiveSubscription,
    hasActiveTrial: usageState.hasActiveTrial,
    isTrialExpired: usageState.isTrialExpired,
    canRecord: usageState.canRecord,
    canAccessFeatures: usageState.canAccessFeatures,
    
    // Trial info
    trialDaysRemaining: usageState.trialDaysRemaining,
    trialExpiresAt: usageState.trialExpiresAt,
    
    // Cancellation info
    isCanceling: usageState.isCanceling,
    canceledButStillActive: usageState.canceledButStillActive,
    canceledAt: usageState.canceledAt,
    cancellationReason: usageState.cancellationReason,
    accessEndsAt: usageState.accessEndsAt,
    daysUntilAccessEnds: usageState.daysUntilAccessEnds,
    
    // Helper functions
    shouldShowPaywall,
    isTrialEndingSoon,
    canAccessMeetingDetails,
    canStartRecording,
    getStatusMessage,
    isSubscriptionCanceling,
    isInCancellationGracePeriod,
    getCancellationInfo,
    
    // Deprecated but kept for backward compatibility
    isInFreeTrial: usageState.hasActiveTrial, // Alias for hasActiveTrial
    getCreditStatusMessage, // Alias for getStatusMessage
    isLowOnCredits, // Always returns false now
    getAvailableMinutes, // Returns Infinity during trial/sub
    
    // Refresh functions
    refreshUsage,
    refreshCanRecord,
    refreshSubscription,
  };
});
