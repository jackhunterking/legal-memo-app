/**
 * Safe Haptics Wrapper
 * 
 * Wraps expo-haptics calls in try-catch blocks to prevent crashes
 * when native modules aren't properly initialized (especially with
 * React Native New Architecture).
 * 
 * The "new NativeEventEmitter() requires a non-null argument" error
 * can occur when the native haptics module isn't ready. This wrapper
 * gracefully handles such failures.
 */

import { Platform } from 'react-native';

// Lazy-load expo-haptics to avoid initialization issues
let Haptics: typeof import('expo-haptics') | null = null;
let loadingPromise: Promise<typeof import('expo-haptics') | null> | null = null;

const loadHaptics = async (): Promise<typeof import('expo-haptics') | null> => {
  if (Haptics) return Haptics;
  if (loadingPromise) return loadingPromise;
  
  loadingPromise = (async () => {
    try {
      const module = await import('expo-haptics');
      // Validate that the module has expected exports
      if (module && typeof module.impactAsync === 'function') {
        Haptics = module;
        return Haptics;
      }
      console.warn('[Haptics] expo-haptics module loaded but missing expected exports');
      return null;
    } catch (error) {
      console.warn('[Haptics] Failed to load expo-haptics:', error);
      return null;
    }
  })();
  
  return loadingPromise;
};

// Pre-load haptics module on native platforms (wrapped in try-catch for safety)
if (Platform.OS !== 'web') {
  try {
    loadHaptics();
  } catch (e) {
    console.warn('[Haptics] Pre-load failed:', e);
  }
}

/**
 * Safe wrapper for impact haptic feedback
 * Silently fails if haptics unavailable
 */
export const impactAsync = async (
  style: 'Light' | 'Medium' | 'Heavy' | 'Rigid' | 'Soft' = 'Light'
): Promise<void> => {
  if (Platform.OS === 'web') return;
  
  try {
    const haptics = await loadHaptics();
    if (!haptics) return;
    
    const styleMap = {
      Light: haptics.ImpactFeedbackStyle.Light,
      Medium: haptics.ImpactFeedbackStyle.Medium,
      Heavy: haptics.ImpactFeedbackStyle.Heavy,
      Rigid: haptics.ImpactFeedbackStyle.Rigid,
      Soft: haptics.ImpactFeedbackStyle.Soft,
    };
    
    await haptics.impactAsync(styleMap[style]);
  } catch (error) {
    // Silently fail - haptics are non-essential
    console.debug('[Haptics] Impact failed:', error);
  }
};

/**
 * Safe wrapper for notification haptic feedback
 * Silently fails if haptics unavailable
 */
export const notificationAsync = async (
  type: 'Success' | 'Warning' | 'Error' = 'Success'
): Promise<void> => {
  if (Platform.OS === 'web') return;
  
  try {
    const haptics = await loadHaptics();
    if (!haptics) return;
    
    const typeMap = {
      Success: haptics.NotificationFeedbackType.Success,
      Warning: haptics.NotificationFeedbackType.Warning,
      Error: haptics.NotificationFeedbackType.Error,
    };
    
    await haptics.notificationAsync(typeMap[type]);
  } catch (error) {
    // Silently fail - haptics are non-essential
    console.debug('[Haptics] Notification failed:', error);
  }
};

/**
 * Safe wrapper for selection haptic feedback
 * Silently fails if haptics unavailable
 */
export const selectionAsync = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  
  try {
    const haptics = await loadHaptics();
    if (!haptics) return;
    
    await haptics.selectionAsync();
  } catch (error) {
    // Silently fail - haptics are non-essential
    console.debug('[Haptics] Selection failed:', error);
  }
};

// Export convenience methods that match common usage patterns
export const lightImpact = () => impactAsync('Light');
export const mediumImpact = () => impactAsync('Medium');
export const heavyImpact = () => impactAsync('Heavy');
export const successNotification = () => notificationAsync('Success');
export const warningNotification = () => notificationAsync('Warning');
export const errorNotification = () => notificationAsync('Error');

