import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';
import type { Session, User } from '@supabase/supabase-js';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    console.log('[AuthContext] Initializing auth state...');
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[AuthContext] Got session:', session?.user?.email);
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('[AuthContext] Auth state changed:', _event, session?.user?.email);
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
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
      const { data, error } = await supabase.auth.signUp({ email, password });
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
          default_hourly_rate: profileData.default_hourly_rate ?? 250,
          last_billable_setting: profileData.last_billable_setting ?? false,
          onboarding_completed: true,
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
