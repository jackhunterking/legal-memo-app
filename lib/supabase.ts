import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Log configuration on load
console.log('[Supabase] Initializing client...');
console.log('[Supabase] URL configured:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'MISSING!');
console.log('[Supabase] Anon key configured:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : 'MISSING!');
console.log('[Supabase] Platform:', Platform.OS);

const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string) => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

console.log('[Supabase] Client created successfully');

/**
 * Initialize Supabase auth for Edge Functions.
 * Call this once at app startup to ensure functions always have a valid token.
 * Automatically updates the token when auth state changes.
 */
let functionsAuthInitialized = false;
let currentAuthToken: string | null = null;

export async function initSupabaseAuthForFunctions(client: SupabaseClient = supabase): Promise<void> {
  console.log('[Supabase] initSupabaseAuthForFunctions called, already initialized:', functionsAuthInitialized);
  
  if (functionsAuthInitialized) {
    console.log('[Supabase] Skipping init - already initialized. Current token exists:', !!currentAuthToken);
    return;
  }
  
  try {
    // Get current session and set initial token
    console.log('[Supabase] Getting current session...');
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    
    if (sessionError) {
      console.error('[Supabase] Error getting session:', sessionError);
    }
    
    console.log('[Supabase] Session retrieved:', {
      hasSession: !!session,
      userId: session?.user?.id,
      userEmail: session?.user?.email,
      tokenLength: session?.access_token?.length,
      tokenPrefix: session?.access_token?.substring(0, 20),
      expiresAt: session?.expires_at,
    });
    
    currentAuthToken = session?.access_token ?? null;
    await client.functions.setAuth(currentAuthToken ?? '');
    console.log('[Supabase] setAuth called with token length:', currentAuthToken?.length ?? 0);
    
    // Keep token updated on auth state changes
    client.auth.onAuthStateChange(async (event, session) => {
      console.log('[Supabase] Auth state changed:', {
        event,
        hasSession: !!session,
        userId: session?.user?.id,
        tokenLength: session?.access_token?.length,
      });
      currentAuthToken = session?.access_token ?? null;
      await client.functions.setAuth(currentAuthToken ?? '');
      console.log('[Supabase] Updated functions auth token, length:', currentAuthToken?.length ?? 0);
    });
    
    functionsAuthInitialized = true;
    console.log('[Supabase] Functions auth initialized successfully');
  } catch (err) {
    console.error('[Supabase] initSupabaseAuthForFunctions error:', err);
    throw err;
  }
}

/**
 * Check if functions auth is initialized and has a valid token
 */
export function getFunctionsAuthStatus() {
  return {
    initialized: functionsAuthInitialized,
    hasToken: !!currentAuthToken,
    tokenLength: currentAuthToken?.length ?? 0,
    tokenPrefix: currentAuthToken?.substring(0, 20) ?? null,
  };
}

/**
 * Get AssemblyAI token from Edge Function.
 * This helper ensures consistent invocation with comprehensive logging.
 */
export async function getAssemblyToken(client: SupabaseClient = supabase) {
  const startTime = Date.now();
  console.log('[Supabase] ========== getAssemblyToken START ==========');
  console.log('[Supabase] Functions auth status:', getFunctionsAuthStatus());
  
  // Get fresh session to ensure we have current auth state
  console.log('[Supabase] Getting fresh session for function call...');
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  
  if (sessionError) {
    console.error('[Supabase] Session error before function call:', sessionError);
  }
  
  console.log('[Supabase] Current session state:', {
    hasSession: !!session,
    userId: session?.user?.id,
    userEmail: session?.user?.email,
    tokenLength: session?.access_token?.length,
    tokenPrefix: session?.access_token?.substring(0, 20),
    tokenSuffix: session?.access_token?.substring(session?.access_token?.length - 10),
    expiresAt: session?.expires_at,
    isExpired: session?.expires_at ? new Date(session.expires_at * 1000) < new Date() : 'no expiry',
  });

  // Build the function URL for logging
  const functionUrl = `${supabaseUrl}/functions/v1/get-assemblyai-token`;
  console.log('[Supabase] Function URL:', functionUrl);
  
  console.log('[Supabase] Invoking Edge Function: get-assemblyai-token');
  console.log('[Supabase] Invocation config:', {
    method: 'POST',
    functionName: 'get-assemblyai-token',
  });

  try {
    const response = await client.functions.invoke('get-assemblyai-token', { 
      method: 'POST',
    });
    
    const elapsed = Date.now() - startTime;
    
    console.log('[Supabase] Function response received in', elapsed, 'ms');
    console.log('[Supabase] Response data:', JSON.stringify(response.data, null, 2));
    console.log('[Supabase] Response error:', response.error ? JSON.stringify(response.error, null, 2) : 'none');
    
    if (response.error) {
      console.error('[Supabase] ========== getAssemblyToken FAILED ==========');
      console.error('[Supabase] Error details:', {
        message: response.error.message,
        name: response.error.name,
        context: response.error.context,
        status: response.error.status,
        fullError: JSON.stringify(response.error),
      });
    } else {
      console.log('[Supabase] ========== getAssemblyToken SUCCESS ==========');
      console.log('[Supabase] Token received:', {
        hasToken: !!response.data?.token,
        tokenLength: response.data?.token?.length,
        userId: response.data?.user_id,
        expiresAt: response.data?.expires_at,
        websocketUrl: response.data?.websocket_url,
      });
    }
    
    return response;
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error('[Supabase] ========== getAssemblyToken EXCEPTION ==========');
    console.error('[Supabase] Exception after', elapsed, 'ms');
    console.error('[Supabase] Error type:', err?.constructor?.name);
    console.error('[Supabase] Error message:', err instanceof Error ? err.message : String(err));
    console.error('[Supabase] Error stack:', err instanceof Error ? err.stack : 'no stack');
    console.error('[Supabase] Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    throw err;
  }
}
