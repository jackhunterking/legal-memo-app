/**
 * AppConfigContext
 * 
 * Manages app-wide configuration including force update checks.
 * 
 * Features:
 * - Fetches force_update config from Supabase app_config table
 * - Reports current app version to user's profile on each launch
 * - Compares user's version against minimum required version
 * - Provides needsForceUpdate flag for routing decisions
 * 
 * Usage:
 * - Wrap app with AppConfigProvider (inside AuthProvider)
 * - Use useAppConfig() to access force update status
 * - Check needsForceUpdate in index.tsx to redirect to force-update screen
 */

import createContextHook from '@nkzw/create-context-hook';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { getAppVersion, needsUpdate } from '@/lib/version';

const LOG_PREFIX = '[AppConfig]';

interface ForceUpdateConfig {
  enabled: boolean;
  minimum_version: string;
  message: string;
}

interface AppConfigState {
  // Force update state
  forceUpdateEnabled: boolean;
  minimumVersion: string;
  forceUpdateMessage: string;
  needsForceUpdate: boolean;
  
  // Current app info
  currentVersion: string;
  
  // Loading state
  isLoading: boolean;
  
  // Actions
  refreshConfig: () => Promise<void>;
}

export const [AppConfigProvider, useAppConfig] = createContextHook(() => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const hasReportedVersionRef = useRef(false);

  // Get current app version
  const currentVersion = getAppVersion();

  // ============================================
  // FORCE UPDATE CONFIG QUERY
  // ============================================
  
  const configQuery = useQuery({
    queryKey: ['appConfig', 'force_update'],
    queryFn: async (): Promise<ForceUpdateConfig | null> => {
      console.log(`${LOG_PREFIX} Fetching force_update config...`);
      
      const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'force_update')
        .single();
      
      if (error) {
        // Table might not exist yet (migration not run)
        if (error.code === 'PGRST116' || error.code === '42P01') {
          console.log(`${LOG_PREFIX} No force_update config found (table may not exist)`);
          return null;
        }
        console.error(`${LOG_PREFIX} Error fetching config:`, error.message);
        return null;
      }
      
      const config = data?.value as ForceUpdateConfig;
      console.log(`${LOG_PREFIX} Config loaded:`, {
        enabled: config?.enabled,
        minimum_version: config?.minimum_version,
      });
      
      return config;
    },
    // Always fetch config, even without auth (for force update to work on login screen)
    enabled: true,
    staleTime: 60000, // Consider stale after 1 minute
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // ============================================
  // REPORT APP VERSION TO DATABASE
  // ============================================
  
  useEffect(() => {
    const reportVersion = async () => {
      if (!user?.id || !profile) {
        hasReportedVersionRef.current = false;
        return;
      }
      
      // Only report once per session
      if (hasReportedVersionRef.current) {
        return;
      }
      
      console.log(`${LOG_PREFIX} Reporting app version: ${currentVersion}`);
      
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            current_app_version: currentVersion,
            last_app_open: new Date().toISOString(),
          })
          .eq('id', user.id);
        
        if (error) {
          // Column might not exist yet (migration not run)
          if (error.code === '42703') {
            console.log(`${LOG_PREFIX} Version columns don't exist yet (migration pending)`);
            return;
          }
          console.error(`${LOG_PREFIX} Error reporting version:`, error.message);
        } else {
          console.log(`${LOG_PREFIX} Version reported successfully`);
          hasReportedVersionRef.current = true;
        }
      } catch (err) {
        console.error(`${LOG_PREFIX} Exception reporting version:`, err);
      }
    };
    
    reportVersion();
  }, [user?.id, profile, currentVersion]);

  // ============================================
  // APP STATE LISTENER - Refresh on foreground
  // ============================================
  
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // When app comes back from background to active, refresh config
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log(`${LOG_PREFIX} App became active, refreshing config...`);
        queryClient.invalidateQueries({ queryKey: ['appConfig', 'force_update'] });
        
        // Report version again when coming back to foreground
        hasReportedVersionRef.current = false;
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [queryClient]);

  // ============================================
  // COMPUTED STATE
  // ============================================
  
  const config = configQuery.data;
  
  const forceUpdateEnabled = config?.enabled ?? false;
  const minimumVersion = config?.minimum_version ?? '1.0.0';
  const forceUpdateMessage = config?.message ?? 'Please update your app to continue.';
  
  // Determine if force update is needed
  const needsForceUpdate = forceUpdateEnabled && needsUpdate(currentVersion, minimumVersion);
  
  if (needsForceUpdate) {
    console.log(`${LOG_PREFIX} Force update required!`, {
      currentVersion,
      minimumVersion,
      enabled: forceUpdateEnabled,
    });
  }

  // ============================================
  // ACTIONS
  // ============================================
  
  const refreshConfig = async () => {
    console.log(`${LOG_PREFIX} Manually refreshing config...`);
    await queryClient.invalidateQueries({ queryKey: ['appConfig', 'force_update'] });
  };

  // ============================================
  // RETURN STATE
  // ============================================
  
  return {
    // Force update state
    forceUpdateEnabled,
    minimumVersion,
    forceUpdateMessage,
    needsForceUpdate,
    
    // Current app info
    currentVersion,
    
    // Loading state
    isLoading: configQuery.isLoading,
    
    // Actions
    refreshConfig,
  } satisfies AppConfigState;
});

