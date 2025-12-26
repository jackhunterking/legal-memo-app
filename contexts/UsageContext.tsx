/**
 * UsageContext
 * 
 * Manages subscription status and usage tracking for Polar web checkout billing.
 * Handles the Supabase-side data (usage minutes, transactions, free trial, subscription).
 * 
 * Provides hooks to:
 * - Check if user can record (has credits/subscription)
 * - Get current usage stats
 * - Get subscription details from Supabase
 * - Refresh usage after recording
 * - Refresh subscription after Polar checkout success
 */

import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import type { 
  Subscription, 
  UsageCredits, 
  UsageTransaction, 
  UsageState, 
  CanRecordResult,
  SUBSCRIPTION_PLAN,
} from '@/types';
import { 
  calculateOverageCharge, 
  getDaysRemainingInPeriod,
} from '@/types';

export const [UsageProvider, useUsage] = createContextHook(() => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

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
  // USAGE CREDITS QUERY
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
      
      console.log('[UsageContext] Usage credits:', data.minutes_used_this_period);
      return data;
    },
    enabled: !!user?.id,
  });

  // ============================================
  // CAN RECORD CHECK (using database function)
  // ============================================
  
  const canRecordQuery = useQuery({
    queryKey: ['canRecord', user?.id],
    queryFn: async (): Promise<CanRecordResult | null> => {
      if (!user?.id) return null;
      console.log('[UsageContext] Checking if user can record...');
      
      const { data, error } = await supabase.rpc('can_user_record', {
        p_user_id: user.id,
      });
      
      if (error) {
        console.error('[UsageContext] Error checking can_record:', error.message);
        // Default to allowing recording if check fails (to not block users)
        return {
          can_record: true,
          has_free_trial: true,
          free_trial_remaining: 15,
          has_subscription: false,
          subscription_status: null,
          reason: 'free_trial',
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
  // COMPUTED USAGE STATE
  // ============================================
  
  const computeUsageState = (): UsageState => {
    const subscription = subscriptionQuery.data;
    const usageCredits = usageCreditsQuery.data;
    const canRecordResult = canRecordQuery.data;
    
    const hasActiveSubscription = subscription?.status === 'active';
    const minutesIncluded = subscription?.monthly_minutes_included ?? 10;
    const overageRateCents = subscription?.overage_rate_cents ?? 100;
    const minutesUsedThisPeriod = usageCredits?.minutes_used_this_period ?? 0;
    
    // Calculate remaining and overage
    const minutesRemaining = Math.max(0, minutesIncluded - minutesUsedThisPeriod);
    const overageMinutes = Math.max(0, minutesUsedThisPeriod - minutesIncluded);
    const estimatedOverageCharge = calculateOverageCharge(overageMinutes, overageRateCents);
    
    // Period dates
    const periodStart = usageCredits?.period_start ? new Date(usageCredits.period_start) : null;
    const periodEnd = usageCredits?.period_end ? new Date(usageCredits.period_end) : null;
    const daysRemainingInPeriod = getDaysRemainingInPeriod(periodEnd);
    
    // Free trial from profile
    const freeTrialMinutesRemaining = profile?.free_trial_minutes_remaining ?? 15;
    const isInFreeTrial = (profile?.has_free_trial ?? true) && freeTrialMinutesRemaining > 0;
    
    return {
      hasActiveSubscription,
      subscription,
      isInFreeTrial,
      freeTrialMinutesRemaining,
      minutesUsedThisPeriod,
      minutesIncluded,
      minutesRemaining,
      overageMinutes,
      overageRateCents,
      estimatedOverageCharge,
      lifetimeMinutesUsed: usageCredits?.lifetime_minutes_used ?? 0,
      periodStart,
      periodEnd,
      daysRemainingInPeriod,
      canRecord: canRecordResult?.can_record ?? (isInFreeTrial || hasActiveSubscription),
      canRecordReason: canRecordResult?.reason ?? (hasActiveSubscription ? 'active_subscription' : isInFreeTrial ? 'free_trial' : 'no_credits'),
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
      queryClient.invalidateQueries({ queryKey: ['usageTransactions', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] }),
    ]);
  };

  const refreshCanRecord = async () => {
    await queryClient.invalidateQueries({ queryKey: ['canRecord', user?.id] });
  };

  /**
   * Refresh subscription data specifically (called after Polar checkout success)
   */
  const refreshSubscription = async () => {
    console.log('[UsageContext] Refreshing subscription data after checkout...');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['subscription', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['canRecord', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] }),
    ]);
  };

  // ============================================
  // HELPER FUNCTIONS
  // ============================================
  
  /**
   * Check if user needs to see paywall (no credits available)
   */
  const shouldShowPaywall = (): boolean => {
    return !usageState.canRecord;
  };

  /**
   * Check if user's credits are running low (for free trial only)
   * Subscribers have unlimited access
   */
  const isLowOnCredits = (): boolean => {
    if (usageState.hasActiveSubscription) {
      // Unlimited subscribers never run low
      return false;
    }
    return usageState.freeTrialMinutesRemaining < 3;
  };

  /**
   * Get available minutes (free trial or subscription)
   * Subscribers have unlimited access
   */
  const getAvailableMinutes = (): number => {
    if (usageState.hasActiveSubscription) {
      // Unlimited access for subscribers
      return Infinity;
    }
    return usageState.freeTrialMinutesRemaining;
  };

  /**
   * Get a user-friendly message about their credit status
   */
  const getCreditStatusMessage = (): string => {
    if (usageState.hasActiveSubscription) {
      return 'Unlimited Access';
    }
    
    if (usageState.isInFreeTrial) {
      return `${usageState.freeTrialMinutesRemaining} free trial min remaining`;
    }
    
    return 'Subscribe for unlimited access';
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
    isInFreeTrial: usageState.isInFreeTrial,
    canRecord: usageState.canRecord,
    
    // Helper functions
    shouldShowPaywall,
    isLowOnCredits,
    getAvailableMinutes,
    getCreditStatusMessage,
    
    // Refresh functions
    refreshUsage,
    refreshCanRecord,
    refreshSubscription,
  };
});

