/**
 * Version Utilities
 * 
 * Handles app version tracking, comparison, and reporting.
 * Used for force update feature to ensure users are on the minimum required version.
 */

import Constants from 'expo-constants';

/**
 * Get the current app version from app.json/app.config.js
 * Falls back to '1.0.0' if not available
 */
export const getAppVersion = (): string => {
  return Constants.expoConfig?.version || (Constants.manifest as { version?: string } | null)?.version || '1.0.0';
};

/**
 * Get the app build number (iOS CFBundleVersion / Android versionCode)
 * Falls back to '1' if not available
 */
export const getBuildNumber = (): string => {
  const ios = Constants.expoConfig?.ios?.buildNumber;
  const android = Constants.expoConfig?.android?.versionCode?.toString();
  return ios || android || '1';
};

/**
 * Compare two semantic version strings
 * Returns:
 *   -1 if a < b (a is older)
 *    0 if a === b (same version)
 *    1 if a > b (a is newer)
 * 
 * @example
 * compareVersions('1.0.0', '1.0.1') // -1
 * compareVersions('2.0.0', '1.9.9') // 1
 * compareVersions('1.0.0', '1.0.0') // 0
 */
export const compareVersions = (a: string, b: string): number => {
  // Handle null/undefined
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  // Split into parts and compare
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  const maxLength = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLength; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }

  return 0;
};

/**
 * Check if the current version is below the minimum required version
 * 
 * @param currentVersion - The user's current app version
 * @param minVersion - The minimum required version
 * @returns true if update is needed (current < min)
 * 
 * @example
 * needsUpdate('1.0.0', '1.2.0') // true
 * needsUpdate('1.2.0', '1.0.0') // false
 * needsUpdate('1.2.0', '1.2.0') // false
 */
export const needsUpdate = (currentVersion: string, minVersion: string): boolean => {
  return compareVersions(currentVersion, minVersion) < 0;
};

/**
 * Check if the current version is at least the minimum required version
 * 
 * @param currentVersion - The user's current app version
 * @param minVersion - The minimum required version
 * @returns true if version is sufficient (current >= min)
 */
export const meetsMinimumVersion = (currentVersion: string, minVersion: string): boolean => {
  return compareVersions(currentVersion, minVersion) >= 0;
};

/**
 * Format version for display
 * @param version - Version string
 * @param includeBuild - Whether to include build number
 */
export const formatVersion = (version?: string, includeBuild?: boolean): string => {
  const v = version || getAppVersion();
  if (includeBuild) {
    return `v${v} (${getBuildNumber()})`;
  }
  return `v${v}`;
};

