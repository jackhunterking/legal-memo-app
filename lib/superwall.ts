/**
 * Superwall Configuration
 * 
 * DISABLED: Superwall integration is currently disabled.
 * Using custom PaywallModal with direct Polar checkout instead.
 * 
 * To re-enable Superwall:
 * 1. Set SUPERWALL_ENABLED to true
 * 2. Uncomment the API key
 * 3. Update SuperwallContext.tsx to use the SDK again
 */

// Superwall is currently disabled - using custom paywall
const SUPERWALL_ENABLED = false;

// Superwall API Key (currently disabled)
// export const SUPERWALL_API_KEY = 'pk_KptFaJMbSpwaTKKrLngdR';
export const SUPERWALL_API_KEY = '';

// For platform-specific keys (if needed in the future)
export const SUPERWALL_IOS_API_KEY = SUPERWALL_API_KEY;
export const SUPERWALL_ANDROID_API_KEY = SUPERWALL_API_KEY;

// Polar checkout URL for external payment processing
export const POLAR_CHECKOUT_URL = process.env.EXPO_PUBLIC_POLAR_CHECKOUT_URL || '';

const LOG_PREFIX = '[Superwall]';

// Log configuration status
console.log(`${LOG_PREFIX} Superwall is DISABLED - using custom PaywallModal`);
console.log(`${LOG_PREFIX} Polar checkout URL configured:`, POLAR_CHECKOUT_URL ? `${POLAR_CHECKOUT_URL.substring(0, 30)}...` : 'MISSING!');

/**
 * Check if Superwall is properly configured
 * Currently always returns false as Superwall is disabled
 */
export function isSuperwallConfigured(): boolean {
  return SUPERWALL_ENABLED && !!SUPERWALL_API_KEY;
}
