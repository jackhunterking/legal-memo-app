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
  const [isLoading, setIsLoading] = useState(true);
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
      setIsLoading(false);
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
      setIsLoading(false);
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
        console.log('[AuthContext] Profile fetch error:', error.message);
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }
      
      console.log('[AuthContext] Profile fetched:', data);
      return data;
    },
    enabled: !!user?.id,
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
      console.log('[AuthContext] Creating profile for user:', userId);
      
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email: userEmail,
          display_name: profileData.display_name ?? null,
          onboarding_completed: true,
          // Set trial start date for new users (7-day free trial starts now)
          trial_started_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;
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

  return {
    session,
    user,
    profile: profileQuery.data,
    isLoading: isLoading || profileQuery.isLoading,
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
