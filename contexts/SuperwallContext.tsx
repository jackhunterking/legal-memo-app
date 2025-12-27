/**
 * SuperwallContext
 * 
 * DISABLED: Superwall integration is currently disabled.
 * This module provides stub implementations that maintain API compatibility
 * while the app uses the custom PaywallModal with direct Polar checkout.
 * 
 * To re-enable Superwall:
 * 1. Update lib/superwall.ts to enable Superwall
 * 2. Restore the original SuperwallContext implementation
 * 3. Test the Superwall paywall flow
 */

import React, { useCallback } from 'react';
import { useUsage } from './UsageContext';

const LOG_PREFIX = '[SuperwallContext]';

interface SuperwallWrapperProps {
  children: React.ReactNode;
}

/**
 * SuperwallProvider component (Disabled)
 * 
 * Simply passes through children without Superwall SDK.
 * All paywall functionality is handled by PaywallModal component directly.
 */
export function SuperwallProvider({ children }: SuperwallWrapperProps) {
  console.log(`${LOG_PREFIX} Superwall is disabled - using pass-through provider`);
  return <>{children}</>;
}

/**
 * Stub hook for Superwall paywall functionality
 * 
 * Returns no-op functions that maintain API compatibility.
 * The actual paywall is shown via PaywallModal component.
 */
export function useSuperwallPaywall() {
  const { hasActiveSubscription, hasActiveTrial, refreshSubscription } = useUsage();

  // Stub function - paywall is handled by PaywallModal component
  const triggerPaywall = useCallback(async (
    _placement: string = 'campaign_trigger',
    feature?: () => void
  ) => {
    // If user has access and feature is provided, execute it directly
    if (hasActiveSubscription || hasActiveTrial) {
      console.log(`${LOG_PREFIX} User has access, not showing paywall`);
      if (feature) {
        feature();
      }
      return;
    }

    console.log(`${LOG_PREFIX} triggerPaywall called but Superwall is disabled`);
    console.log(`${LOG_PREFIX} Use PaywallModal component directly instead`);
  }, [hasActiveSubscription, hasActiveTrial]);

  // Stub function - paywall is handled by PaywallModal component
  const forceShowPaywall = useCallback(async (
    _placement: string = 'campaign_trigger',
    _feature?: () => void
  ) => {
    console.log(`${LOG_PREFIX} forceShowPaywall called but Superwall is disabled`);
    console.log(`${LOG_PREFIX} Use PaywallModal component directly instead`);
  }, []);

  return {
    triggerPaywall,
    forceShowPaywall,
    refreshSubscription,
    // Stub paywall state
    paywallState: null,
  };
}

/**
 * Stub hook for Superwall SDK access
 * Returns a mock object with commonly used methods
 */
export function useSuperwall() {
  return {
    // Stub for deep link handling - always returns false (not handled)
    handleDeepLink: async (_url: string): Promise<boolean> => {
      console.log(`${LOG_PREFIX} handleDeepLink called but Superwall is disabled`);
      return false;
    },
    // Add other stub methods as needed
    identify: (_userId: string) => {
      console.log(`${LOG_PREFIX} identify called but Superwall is disabled`);
    },
    signOut: () => {
      console.log(`${LOG_PREFIX} signOut called but Superwall is disabled`);
    },
    setUserAttributes: (_attributes: Record<string, unknown>) => {
      console.log(`${LOG_PREFIX} setUserAttributes called but Superwall is disabled`);
    },
  };
}

/**
 * Stub hook for Superwall placement
 * Returns no-op functions that maintain API compatibility
 */
export function usePlacement(_options?: {
  onPresent?: (info: unknown) => void;
  onDismiss?: (info: unknown, result: unknown) => void;
  onSkip?: (reason: unknown) => void;
  onError?: (error: unknown) => void;
}) {
  return {
    registerPlacement: async (_params: { placement: string; feature?: () => void }) => {
      console.log(`${LOG_PREFIX} registerPlacement called but Superwall is disabled`);
    },
    state: null,
  };
}
