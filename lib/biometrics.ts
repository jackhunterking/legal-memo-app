import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const BIOMETRIC_CREDENTIALS_KEY = 'biometric_credentials';

export interface BiometricCredentials {
  email: string;
  encryptedPassword: string;
}

export async function isBiometricSupported(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return compatible && enrolled;
  } catch (error) {
    console.error('[Biometrics] Check support error:', error);
    return false;
  }
}

export async function getBiometricType(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Face ID';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'Touch ID';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'Iris';
    }
    
    return 'Biometric';
  } catch (error) {
    console.error('[Biometrics] Get type error:', error);
    return null;
  }
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authenticate to sign in',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    return result.success;
  } catch (error) {
    console.error('[Biometrics] Authenticate error:', error);
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const enabled = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
    return enabled === 'true';
  } catch (error) {
    console.error('[Biometrics] Check enabled error:', error);
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled.toString());
    console.log('[Biometrics] Enabled set to:', enabled);
  } catch (error) {
    console.error('[Biometrics] Set enabled error:', error);
    throw error;
  }
}

export async function saveBiometricCredentials(credentials: BiometricCredentials): Promise<void> {
  try {
    const jsonCredentials = JSON.stringify(credentials);
    await AsyncStorage.setItem(BIOMETRIC_CREDENTIALS_KEY, jsonCredentials);
    console.log('[Biometrics] Credentials saved');
  } catch (error) {
    console.error('[Biometrics] Save credentials error:', error);
    throw error;
  }
}

export async function getBiometricCredentials(): Promise<BiometricCredentials | null> {
  try {
    const jsonCredentials = await AsyncStorage.getItem(BIOMETRIC_CREDENTIALS_KEY);
    if (!jsonCredentials) {
      return null;
    }
    return JSON.parse(jsonCredentials);
  } catch (error) {
    console.error('[Biometrics] Get credentials error:', error);
    return null;
  }
}

export async function clearBiometricCredentials(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BIOMETRIC_CREDENTIALS_KEY);
    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
    console.log('[Biometrics] Credentials cleared');
  } catch (error) {
    console.error('[Biometrics] Clear credentials error:', error);
    throw error;
  }
}
