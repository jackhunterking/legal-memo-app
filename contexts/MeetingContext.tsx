import createContextHook from '@nkzw/create-context-hook';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import type { Meeting, MeetingWithContact, MeetingWithDetails, MeetingType, MeetingShare, MeetingShareLink } from '@/types';
import { generateShareToken } from '@/types';
import * as Crypto from 'expo-crypto';

export const [MeetingProvider, useMeetings] = createContextHook(() => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

  // ============================================
  // MEETING TYPES
  // ============================================

  // Fetch all meeting types for the user
  const meetingTypesQuery = useQuery({
    queryKey: ['meetingTypes', user?.id],
    queryFn: async (): Promise<MeetingType[]> => {
      if (!user?.id) return [];
      console.log('[MeetingContext] Fetching meeting types...');
      
      const { data, error } = await supabase
        .from('meeting_types')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true });
      
      if (error) {
        console.error('[MeetingContext] Error fetching meeting types:', error.message);
        return [];
      }
      
      console.log('[MeetingContext] Fetched', data?.length, 'meeting types');
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Create a new meeting type
  const createMeetingTypeMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }): Promise<MeetingType> => {
      if (!user?.id) throw new Error('Not authenticated');
      console.log('[MeetingContext] Creating meeting type:', name);
      
      // Get the max display_order to put new type at the end
      const currentTypes = meetingTypesQuery.data || [];
      const maxOrder = currentTypes.length > 0 
        ? Math.max(...currentTypes.map(t => t.display_order)) 
        : 0;
      
      const { data, error } = await supabase
        .from('meeting_types')
        .insert({
          user_id: user.id,
          name,
          color,
          is_default: false,
          display_order: maxOrder + 1,
        })
        .select()
        .single();
      
      if (error) {
        console.error('[MeetingContext] Error creating meeting type:', error.message);
        throw new Error(error.message || 'Failed to create meeting type');
      }
      
      console.log('[MeetingContext] Created meeting type:', data.id);
      return data;
    },
    onSuccess: () => {
      // Invalidate with the full query key to ensure proper refresh
      queryClient.invalidateQueries({ queryKey: ['meetingTypes', user?.id] });
    },
  });

  // Update a meeting type
  const updateMeetingTypeMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<MeetingType> }): Promise<MeetingType> => {
      console.log('[MeetingContext] Updating meeting type:', id, updates);
      
      const { data, error } = await supabase
        .from('meeting_types')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error('[MeetingContext] Error updating meeting type:', error.message);
        throw new Error(error.message || 'Failed to update meeting type');
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetingTypes', user?.id] });
    },
  });

  // Delete a meeting type
  const deleteMeetingTypeMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      console.log('[MeetingContext] Deleting meeting type:', id);
      
      // First, clear meeting_type_id from any meetings using this type
      await supabase
        .from('meetings')
        .update({ meeting_type_id: null })
        .eq('meeting_type_id', id);
      
      const { error } = await supabase
        .from('meeting_types')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('[MeetingContext] Error deleting meeting type:', error.message);
        throw new Error(error.message || 'Failed to delete meeting type');
      }
      
      console.log('[MeetingContext] Meeting type deleted');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetingTypes', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['meetings', user?.id] });
    },
  });

  // ============================================
  // MEETINGS
  // ============================================

  // Fetch all meetings for the user
  const meetingsQuery = useQuery({
    queryKey: ['meetings', user?.id],
    queryFn: async (): Promise<MeetingWithContact[]> => {
      if (!user?.id) return [];
      console.log('[MeetingContext] Fetching meetings...');
      
      const { data, error } = await supabase
        .from('meetings')
        .select(`
          *,
          contact:contacts(
            id,
            first_name,
            last_name,
            category_id,
            category:contact_categories!category_id(*)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('[MeetingContext] Error fetching meetings:', error.message);
        return [];
      }
      
      console.log('[MeetingContext] Fetched', data?.length, 'meetings');
      return data as MeetingWithContact[] || [];
    },
    enabled: !!user?.id,
    // Refetch when the app comes back to foreground
    refetchOnWindowFocus: true,
    // Refetch when navigating to the Meetings tab
    refetchOnMount: true,
    // Don't go stale immediately - consider data fresh for 30 seconds
    staleTime: 30000,
  });

  // Create a new meeting (when user starts recording)
  // expectedSpeakers: 1 = solo, 2 = two people (default), 3 = three or more
  const createMeetingMutation = useMutation({
    mutationFn: async (expectedSpeakers: number = 2): Promise<Meeting> => {
      if (!user?.id) throw new Error('Not authenticated');
      console.log('[MeetingContext] Creating new meeting with expected speakers:', expectedSpeakers);
      
      const now = new Date();
      const title = `Meeting ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      
      const { data, error } = await supabase
        .from('meetings')
        .insert({
          user_id: user.id,
          title,
          status: 'uploading',
          duration_seconds: 0,
          expected_speakers: expectedSpeakers,
        })
        .select()
        .single();
      
      if (error) {
        console.error('[MeetingContext] Error creating meeting:', error.message);
        throw new Error(error.message || 'Failed to create meeting');
      }
      
      console.log('[MeetingContext] Created meeting:', data.id);
      setActiveMeetingId(data.id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });

  // Upload audio and queue for processing
  const uploadAudioMutation = useMutation({
    mutationFn: async ({
      meetingId,
      audioPath,
      audioFormat,
      durationSeconds,
      recordedAt,
    }: {
      meetingId: string;
      audioPath: string;
      audioFormat: string;
      durationSeconds: number;
      recordedAt: string;
    }) => {
      console.log('[MeetingContext] Uploading audio for meeting:', meetingId);
      
      // Update meeting with audio info and set status to 'queued'
      // This will trigger the database trigger to create a processing job
      const { error } = await supabase
        .from('meetings')
        .update({
          raw_audio_path: audioPath,
          raw_audio_format: audioFormat,
          duration_seconds: durationSeconds,
          recorded_at: recordedAt,
          status: 'queued',
        })
        .eq('id', meetingId);
      
      if (error) {
        console.error('[MeetingContext] Error updating meeting:', error.message);
        throw new Error(error.message || 'Failed to update meeting');
      }
      
      // Explicitly trigger the Edge Function
      // Note: The function now has verify_jwt=false so it can be called without auth
      console.log('[MeetingContext] Triggering processing Edge Function...');
      const { data, error: functionError } = await supabase.functions.invoke('process-recording', {
        body: { meeting_id: meetingId },
      });
      
      if (functionError) {
        console.error('[MeetingContext] Error triggering Edge Function:', functionError);
        
        // Try to get more details from the error response
        let errorMessage = functionError.message || 'Edge Function failed';
        
        // If it's a FunctionsHttpError, try to parse the response body for details
        if (functionError.name === 'FunctionsHttpError' && data) {
          try {
            const errorData = typeof data === 'string' ? JSON.parse(data) : data;
            if (errorData?.error) {
              errorMessage = errorData.error;
            }
          } catch {
            // Ignore parse errors
          }
        }
        
        console.error('[MeetingContext] Detailed error:', errorMessage);
        
        // Update meeting status to failed
        await supabase
          .from('meetings')
          .update({ 
            status: 'failed', 
            error_message: `Processing failed: ${errorMessage}` 
          })
          .eq('id', meetingId);
        throw new Error(`Processing failed: ${errorMessage}`);
      }
      
      console.log('[MeetingContext] Processing triggered successfully:', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });

  // Update meeting details
  const updateMeetingMutation = useMutation({
    mutationFn: async ({
      meetingId,
      updates,
    }: {
      meetingId: string;
      updates: Partial<Meeting>;
    }) => {
      console.log('[MeetingContext] Updating meeting:', meetingId, updates);
      
      const { data, error } = await supabase
        .from('meetings')
        .update(updates)
        .eq('id', meetingId)
        .select()
        .single();
      
      if (error) {
        console.error('[MeetingContext] Error updating meeting:', error.message);
        throw new Error(error.message || 'Failed to update meeting');
      }
      
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting'] });
      // If contact was updated, invalidate contact-related queries too
      if (variables.updates.contact_id !== undefined) {
        queryClient.invalidateQueries({ queryKey: ['contactMeetings'] });
      }
    },
  });

  // Delete a meeting
  const deleteMeetingMutation = useMutation({
    mutationFn: async (meetingId: string) => {
      console.log('[MeetingContext] Deleting meeting:', meetingId);
      
      // Get the meeting to find audio paths
      const { data: meeting } = await supabase
        .from('meetings')
        .select('raw_audio_path, mp3_audio_path')
        .eq('id', meetingId)
        .single();
      
      // Delete audio files from storage
      const pathsToDelete: string[] = [];
      if (meeting?.raw_audio_path) pathsToDelete.push(meeting.raw_audio_path);
      if (meeting?.mp3_audio_path) pathsToDelete.push(meeting.mp3_audio_path);
      
      if (pathsToDelete.length > 0) {
        await supabase.storage.from('meeting-audio').remove(pathsToDelete);
      }
      
      // Delete related records (cascades should handle most, but be explicit)
      await supabase.from('transcript_segments').delete().eq('meeting_id', meetingId);
      await supabase.from('transcripts').delete().eq('meeting_id', meetingId);
      await supabase.from('processing_jobs').delete().eq('meeting_id', meetingId);
      
      // Delete the meeting
      const { error } = await supabase
        .from('meetings')
        .delete()
        .eq('id', meetingId);
      
      if (error) {
        console.error('[MeetingContext] Error deleting meeting:', error.message);
        throw new Error(error.message || 'Failed to delete meeting');
      }
      
      console.log('[MeetingContext] Meeting deleted');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });

  // Retry processing for a failed meeting
  const retryProcessingMutation = useMutation({
    mutationFn: async (meetingId: string) => {
      console.log('[MeetingContext] Retrying processing for:', meetingId);
      
      // Reset meeting status to queued
      await supabase
        .from('meetings')
        .update({ status: 'queued', error_message: null })
        .eq('id', meetingId);
      
      // Reset or create processing job
      await supabase
        .from('processing_jobs')
        .upsert({
          meeting_id: meetingId,
          status: 'pending',
          step: null,
          attempts: 0,
          error: null,
          started_at: null,
          completed_at: null,
        });
      
      // Trigger the Edge Function
      console.log('[MeetingContext] Triggering Edge Function for retry...');
      const { data, error } = await supabase.functions.invoke('process-recording', {
        body: { meeting_id: meetingId },
      });
      
      if (error) {
        console.error('[MeetingContext] Error retrying processing:', error);
        
        // Try to get more details from the error response
        let errorMessage = error.message || 'Edge Function failed';
        
        if (error.name === 'FunctionsHttpError' && data) {
          try {
            const errorData = typeof data === 'string' ? JSON.parse(data) : data;
            if (errorData?.error) {
              errorMessage = errorData.error;
            }
          } catch {
            // Ignore parse errors
          }
        }
        
        // Update meeting status to failed
        await supabase
          .from('meetings')
          .update({ 
            status: 'failed', 
            error_message: `Retry failed: ${errorMessage}` 
          })
          .eq('id', meetingId);
        throw new Error(`Retry failed: ${errorMessage}`);
      }
      
      console.log('[MeetingContext] Retry triggered successfully:', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting'] });
    },
  });

  // ============================================
  // BILLING
  // ============================================

  // Update meeting billing information
  const updateMeetingBillingMutation = useMutation({
    mutationFn: async ({
      meetingId,
      isBillable,
      billableHours,
      billableAmount,
      isManualAmount,
    }: {
      meetingId: string;
      isBillable: boolean;
      billableHours: number | null;
      billableAmount: number | null;
      isManualAmount: boolean;
    }) => {
      console.log('[MeetingContext] Updating meeting billing:', meetingId, { isBillable, billableHours, billableAmount, isManualAmount });
      
      const { data, error } = await supabase
        .from('meetings')
        .update({
          is_billable: isBillable,
          billable_hours: billableHours,
          billable_amount: billableAmount,
          billable_amount_manual: isManualAmount,
        })
        .eq('id', meetingId)
        .select()
        .single();
      
      if (error) {
        console.error('[MeetingContext] Error updating meeting billing:', error.message);
        throw new Error(error.message || 'Failed to update billing');
      }
      
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting', variables.meetingId] });
      // Invalidate contact meetings to update billing summary
      queryClient.invalidateQueries({ queryKey: ['contactMeetings'] });
    },
  });

  // ============================================
  // MEETING SHARES
  // ============================================

  // Create a new share link for a meeting
  const createMeetingShareMutation = useMutation({
    mutationFn: async ({
      meetingId,
      password,
      expiresAt,
    }: {
      meetingId: string;
      password?: string;
      expiresAt?: string;
    }): Promise<MeetingShareLink> => {
      if (!user?.id) throw new Error('Not authenticated');
      console.log('[MeetingContext] Creating share link for meeting:', meetingId);
      
      // Generate a secure random token
      const shareToken = generateShareToken();
      
      // Hash password if provided using expo-crypto
      let passwordHash: string | null = null;
      if (password) {
        // Use SHA-256 hash with a salt for password hashing
        // Note: For production, you might want bcrypt via Edge Function
        const salt = generateShareToken().substring(0, 16);
        const digest = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          salt + password
        );
        passwordHash = salt + ':' + digest;
      }
      
      const { data, error } = await supabase
        .from('meeting_shares')
        .insert({
          meeting_id: meetingId,
          share_token: shareToken,
          password_hash: passwordHash,
          expires_at: expiresAt || null,
          is_active: true,
          view_count: 0,
        })
        .select()
        .single();
      
      if (error) {
        console.error('[MeetingContext] Error creating share link:', error.message);
        throw new Error(error.message || 'Failed to create share link');
      }
      
      // Build the share URL
      // The viewer page is hosted on Vercel (static hosting)
      // Edge Functions can't serve HTML with proper Content-Type, so we use an external viewer
      const viewerUrl = process.env.EXPO_PUBLIC_SHARE_VIEWER_URL || 'https://share-viewer.vercel.app';
      const shareUrl = `${viewerUrl}?token=${shareToken}`;
      
      console.log('[MeetingContext] Created share link:', data.id);
      
      return {
        id: data.id,
        shareUrl,
        hasPassword: !!passwordHash,
        isActive: data.is_active,
        viewCount: data.view_count,
        lastViewedAt: data.last_viewed_at,
        expiresAt: data.expires_at,
        createdAt: data.created_at,
      };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['meetingShares', variables.meetingId] });
    },
  });

  // Toggle share link active status (deactivate/reactivate)
  const toggleMeetingShareMutation = useMutation({
    mutationFn: async ({
      shareId,
      isActive,
    }: {
      shareId: string;
      isActive: boolean;
    }): Promise<void> => {
      console.log('[MeetingContext] Toggling share link:', shareId, 'to', isActive);
      
      const { error } = await supabase
        .from('meeting_shares')
        .update({ is_active: isActive })
        .eq('id', shareId);
      
      if (error) {
        console.error('[MeetingContext] Error toggling share link:', error.message);
        throw new Error(error.message || 'Failed to update share link');
      }
      
      console.log('[MeetingContext] Share link toggled');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetingShares'] });
    },
  });

  // Delete a share link
  const deleteMeetingShareMutation = useMutation({
    mutationFn: async (shareId: string): Promise<void> => {
      console.log('[MeetingContext] Deleting share link:', shareId);
      
      const { error } = await supabase
        .from('meeting_shares')
        .delete()
        .eq('id', shareId);
      
      if (error) {
        console.error('[MeetingContext] Error deleting share link:', error.message);
        throw new Error(error.message || 'Failed to delete share link');
      }
      
      console.log('[MeetingContext] Share link deleted');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetingShares'] });
    },
  });

  return {
    // Meeting data
    meetings: meetingsQuery.data || [],
    isLoading: meetingsQuery.isLoading,
    isRefreshing: meetingsQuery.isRefetching,
    refetchMeetings: meetingsQuery.refetch,
    activeMeetingId,
    setActiveMeetingId,
    
    // Meeting actions
    createMeeting: createMeetingMutation.mutateAsync,
    uploadAudio: uploadAudioMutation.mutateAsync,
    updateMeeting: updateMeetingMutation.mutateAsync,
    deleteMeeting: deleteMeetingMutation.mutateAsync,
    retryProcessing: retryProcessingMutation.mutateAsync,
    
    // Meeting loading states
    isCreating: createMeetingMutation.isPending,
    isUploading: uploadAudioMutation.isPending,
    isUpdating: updateMeetingMutation.isPending,
    isDeleting: deleteMeetingMutation.isPending,
    isRetrying: retryProcessingMutation.isPending,
    
    // Meeting types data
    meetingTypes: meetingTypesQuery.data || [],
    isMeetingTypesLoading: meetingTypesQuery.isLoading,
    refetchMeetingTypes: meetingTypesQuery.refetch,
    
    // Meeting type actions
    createMeetingType: createMeetingTypeMutation.mutateAsync,
    updateMeetingType: updateMeetingTypeMutation.mutateAsync,
    deleteMeetingType: deleteMeetingTypeMutation.mutateAsync,
    
    // Meeting type loading states
    isCreatingType: createMeetingTypeMutation.isPending,
    isUpdatingType: updateMeetingTypeMutation.isPending,
    isDeletingType: deleteMeetingTypeMutation.isPending,
    
    // Billing actions
    updateMeetingBilling: updateMeetingBillingMutation.mutateAsync,
    isUpdatingBilling: updateMeetingBillingMutation.isPending,
    
    // Meeting share actions
    createMeetingShare: createMeetingShareMutation.mutateAsync,
    toggleMeetingShare: toggleMeetingShareMutation.mutateAsync,
    deleteMeetingShare: deleteMeetingShareMutation.mutateAsync,
    
    // Meeting share loading states
    isCreatingShare: createMeetingShareMutation.isPending,
    isTogglingShare: toggleMeetingShareMutation.isPending,
    isDeletingShare: deleteMeetingShareMutation.isPending,
  };
});

// Hook to get a single meeting with all details
export function useMeetingDetails(meetingId: string | null) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['meeting', meetingId, user?.id],
    queryFn: async (): Promise<MeetingWithDetails | null> => {
      if (!meetingId || !user?.id) return null;
      console.log('[MeetingContext] Fetching meeting details:', meetingId);
      
      // Fetch meeting
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', meetingId)
        .eq('user_id', user.id)
        .single();
      
      if (meetingError || !meeting) {
        console.error('[MeetingContext] Error fetching meeting:', meetingError?.message);
        return null;
      }
      
      // Fetch transcript
      const { data: transcript } = await supabase
        .from('transcripts')
        .select('*')
        .eq('meeting_id', meetingId)
        .single();
      
      // Fetch transcript segments
      const { data: segments } = await supabase
        .from('transcript_segments')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('start_ms', { ascending: true });
      
      // Fetch processing job
      const { data: processingJob } = await supabase
        .from('processing_jobs')
        .select('*')
        .eq('meeting_id', meetingId)
        .single();
      
      // Fetch meeting type if assigned
      let meetingType = undefined;
      if (meeting.meeting_type_id) {
        const { data: typeData } = await supabase
          .from('meeting_types')
          .select('*')
          .eq('id', meeting.meeting_type_id)
          .single();
        meetingType = typeData || undefined;
      }
      
      // Fetch contact with category if assigned
      let contact = undefined;
      if (meeting.contact_id) {
        const { data: contactData } = await supabase
          .from('contacts')
          .select(`
            *,
            category:contact_categories(*)
          `)
          .eq('id', meeting.contact_id)
          .single();
        contact = contactData || undefined;
      }
      
      return {
        ...meeting,
        transcript: transcript || undefined,
        segments: segments || undefined,
        processing_job: processingJob || undefined,
        meeting_type: meetingType,
        contact: contact,
      };
    },
    enabled: !!meetingId && !!user?.id,
    // Poll while processing
    refetchInterval: (query) => {
      const data = query.state.data;
      const status = data?.status;
      // Poll every 3 seconds while not ready or failed
      if (status && !['ready', 'failed'].includes(status)) {
        return 3000;
      }
      return false;
    },
  });
}

// Hook to get all share links for a meeting
export function useMeetingShares(meetingId: string | null) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['meetingShares', meetingId, user?.id],
    queryFn: async (): Promise<MeetingShareLink[]> => {
      if (!meetingId || !user?.id) return [];
      console.log('[MeetingContext] Fetching share links for meeting:', meetingId);
      
      const { data, error } = await supabase
        .from('meeting_shares')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('[MeetingContext] Error fetching share links:', error.message);
        return [];
      }
      
      // Build share URLs using the Vercel hosted viewer
      const viewerUrl = process.env.EXPO_PUBLIC_SHARE_VIEWER_URL || 'https://share-viewer.vercel.app';
      
      const shares: MeetingShareLink[] = (data || []).map((share: MeetingShare) => ({
        id: share.id,
        shareUrl: `${viewerUrl}?token=${share.share_token}`,
        hasPassword: !!share.password_hash,
        isActive: share.is_active,
        viewCount: share.view_count,
        lastViewedAt: share.last_viewed_at,
        expiresAt: share.expires_at,
        createdAt: share.created_at,
      }));
      
      console.log('[MeetingContext] Fetched', shares.length, 'share links');
      return shares;
    },
    enabled: !!meetingId && !!user?.id,
  });
}
