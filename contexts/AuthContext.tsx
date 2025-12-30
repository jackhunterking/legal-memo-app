import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, initSupabaseAuthForFunctions, getFunctionsAuthStatus } from '@/lib/supabase';
import type { Profile } from '@/types';
import type { Session, User } from '@supabase/supabase-js';

const LOG_PREFIX = '[AuthContext]';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [functionsAuthReady, setFunctionsAuthReady] = useState(false);
  const queryClient = useQueryClient();
  const initStartedRef = useRef(false);

  useEffect(() => {
    // Prevent double initialization in StrictMode
    if (initStartedRef.current) {
      console.log(`${LOG_PREFIX} Init already started, skipping...`);
      return;
    }
    initStartedRef.current = true;
    
    console.log(`${LOG_PREFIX} ========================================`);
    console.log(`${LOG_PREFIX} INITIALIZING AUTH CONTEXT`);
    console.log(`${LOG_PREFIX} Timestamp: ${new Date().toISOString()}`);
    console.log(`${LOG_PREFIX} ========================================`);
    
    // Initialize functions auth once at startup
    // This sets up the token and keeps it updated on auth state changes
    console.log(`${LOG_PREFIX} Starting initSupabaseAuthForFunctions...`);
    const functionsAuthPromise = initSupabaseAuthForFunctions()
      .then(() => {
        console.log(`${LOG_PREFIX} initSupabaseAuthForFunctions COMPLETED`);
        console.log(`${LOG_PREFIX} Functions auth status:`, JSON.stringify(getFunctionsAuthStatus()));
        setFunctionsAuthReady(true);
      })
      .catch((err) => {
        console.error(`${LOG_PREFIX} initSupabaseAuthForFunctions FAILED:`, err);
        console.error(`${LOG_PREFIX} Error type:`, err?.constructor?.name);
        console.error(`${LOG_PREFIX} Error message:`, err instanceof Error ? err.message : String(err));
      });
    
    console.log(`${LOG_PREFIX} Getting current session...`);
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error(`${LOG_PREFIX} getSession error:`, error);
      }
      console.log(`${LOG_PREFIX} Got session:`, {
        hasSession: !!session,
        email: session?.user?.email,
        userId: session?.user?.id,
        tokenLength: session?.access_token?.length,
        expiresAt: session?.expires_at,
      });
      setSession(session);
      setUser(session?.user ?? null);
      setIsAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`${LOG_PREFIX} Auth state changed:`, {
        event,
        hasSession: !!session,
        email: session?.user?.email,
        userId: session?.user?.id,
        tokenLength: session?.access_token?.length,
      });
      console.log(`${LOG_PREFIX} Functions auth status after change:`, JSON.stringify(getFunctionsAuthStatus()));
      setSession(session);
      setUser(session?.user ?? null);
      setIsAuthLoading(false);
    });

    return () => {
      console.log(`${LOG_PREFIX} Cleaning up auth subscription`);
      subscription.unsubscribe();
    };
  }, []);

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async (): Promise<Profile | null> => {
      if (!user?.id) return null;
      console.log('[AuthContext] Fetching profile for user:', user.id);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) {
        console.log('[AuthContext] Profile fetch error:', error.message, 'Code:', error.code);
        // Handle all "no rows" errors - profile doesn't exist
        // PGRST116 = "The result contains 0 rows"
        // Also handle other similar errors like "Cannot coerce the result"
        if (error.code === 'PGRST116' || error.message.includes('coerce')) {
          console.log('[AuthContext] Profile does not exist for user - possible stale session');
          return null;
        }
        throw error;
      }
      
      console.log('[AuthContext] Profile fetched:', data);
      return data;
    },
    enabled: !!user?.id,
    // Reduce retries for profile fetch - if it fails, it's likely a stale session
    retry: 1,
    retryDelay: 500,
  });

  const signUpMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      console.log('[AuthContext] Signing up:', email);
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          emailRedirectTo: 'legalmemo://',
        }
      });
      if (error) throw error;
      return data;
    },
  });

  const signInMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      console.log('[AuthContext] Signing in:', email);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      console.log('[AuthContext] Signing out...');
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      queryClient.clear();
    },
  });

  const createProfileMutation = useMutation({
    mutationFn: async (profileData: Partial<Profile> & { userId?: string; userEmail?: string }) => {
      const userId = profileData.userId || user?.id;
      const userEmail = profileData.userEmail || user?.email;
      
      if (!userId) throw new Error('No user');
      console.log('[AuthContext] Creating/updating profile for user:', userId);
      
      // First check if profile already exists (should exist from database trigger)
      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('id, onboarding_completed, trial_started_at, display_name')
        .eq('id', userId)
        .single();
      
      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 = no rows found, which is expected if profile doesn't exist
        console.error('[AuthContext] Error checking existing profile:', fetchError);
      }
      
      if (existingProfile) {
        // Profile exists (created by trigger) - just update onboarding status
        console.log('[AuthContext] Profile exists, updating onboarding_completed to true');
        const { data, error } = await supabase
          .from('profiles')
          .update({
            onboarding_completed: true,
            display_name: profileData.display_name ?? existingProfile.display_name,
          })
          .eq('id', userId)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
      
      // Profile doesn't exist (fallback - trigger should have created it)
      // This can happen in edge cases like DB issues or timing problems
      console.log('[AuthContext] Profile does not exist, creating new profile');
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email: userEmail,
          display_name: profileData.display_name ?? null,
          onboarding_completed: true,
          // Set trial start date for new users (7-day free trial starts now)
          trial_started_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) {
        // If insert fails due to FK constraint, user may not exist in auth.users
        // This is a critical error that needs user intervention
        console.error('[AuthContext] Error creating profile:', error);
        if (error.code === '23503') {
          throw new Error('Account setup incomplete. Please sign out and try signing up again.');
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: Partial<Profile>) => {
      if (!user?.id) throw new Error('No user');
      console.log('[AuthContext] Updating profile:', updates);
      
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  // Profile loading: true when we have a user but profile query hasn't completed yet
  const isProfileLoading = !!user?.id && profileQuery.isLoading;
  
  // Fully loaded: auth is done AND if authenticated, profile is also loaded
  const isFullyLoaded = !isAuthLoading && (!user?.id || !profileQuery.isLoading);

  // Detect stale session: user is authenticated but profile doesn't exist after fetch completed
  const profileMissing = !!user?.id && !profileQuery.isLoading && !profileQuery.data;

  // Auto-sign out stale sessions - verify the user actually exists in auth before signing out
  useEffect(() => {
    if (profileMissing) {
      console.log(`${LOG_PREFIX} Profile missing for user ${user?.id}. Verifying session...`);
      
      // Check if the session is actually valid by calling getUser()
      // This will fail if the user was deleted from auth.users
      supabase.auth.getUser().then(({ data, error }) => {
        if (error || !data.user) {
          console.log(`${LOG_PREFIX} Session is stale (user doesn't exist in auth). Signing out...`);
          supabase.auth.signOut().then(() => {
            console.log(`${LOG_PREFIX} Signed out stale session`);
            queryClient.clear();
          }).catch((err) => {
            console.error(`${LOG_PREFIX} Error signing out stale session:`, err);
          });
        } else {
          // User exists but profile doesn't - this is a trigger failure case
          // The email-verified screen will handle creating the profile
          console.log(`${LOG_PREFIX} User exists in auth but profile missing - trigger may have failed`);
        }
      });
    }
  }, [profileMissing, user?.id, queryClient]);

  return {
    session,
    user,
    profile: profileQuery.data,
    // Combined loading state (for backward compatibility)
    isLoading: isAuthLoading || isProfileLoading,
    // Granular loading states
    isAuthLoading,
    isProfileLoading,
    isFullyLoaded,
    isAuthenticated: !!session,
    hasCompletedOnboarding: profileQuery.data?.onboarding_completed ?? false,
    
    signUp: signUpMutation.mutateAsync,
    signIn: signInMutation.mutateAsync,
    signOut: signOutMutation.mutateAsync,
    createProfile: createProfileMutation.mutateAsync,
    updateProfile: updateProfileMutation.mutateAsync,
    
    isSigningUp: signUpMutation.isPending,
    isSigningIn: signInMutation.isPending,
    isSigningOut: signOutMutation.isPending,
    
    signUpError: signUpMutation.error,
    signInError: signInMutation.error,
  };
});
