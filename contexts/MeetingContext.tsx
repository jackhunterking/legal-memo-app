import createContextHook from '@nkzw/create-context-hook';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import type { Meeting, MeetingWithDetails, Transcript, TranscriptSegment } from '@/types';

export const [MeetingProvider, useMeetings] = createContextHook(() => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

  // Fetch all meetings for the user
  const meetingsQuery = useQuery({
    queryKey: ['meetings', user?.id],
    queryFn: async (): Promise<Meeting[]> => {
      if (!user?.id) return [];
      console.log('[MeetingContext] Fetching meetings...');
      
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('[MeetingContext] Error fetching meetings:', error.message);
        return [];
      }
      
      console.log('[MeetingContext] Fetched', data?.length, 'meetings');
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Create a new meeting (when user starts recording)
  const createMeetingMutation = useMutation({
    mutationFn: async (): Promise<Meeting> => {
      if (!user?.id) throw new Error('Not authenticated');
      console.log('[MeetingContext] Creating new meeting...');
      
      const now = new Date();
      const title = `Meeting ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      
      const { data, error } = await supabase
        .from('meetings')
        .insert({
          user_id: user.id,
          title,
          status: 'uploading',
          duration_seconds: 0,
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
      // The Edge Function will be invoked via webhook
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
      
      // Also explicitly trigger the Edge Function (backup in case DB trigger doesn't work)
      try {
        console.log('[MeetingContext] Triggering processing...');
        await supabase.functions.invoke('process-recording', {
          body: { meeting_id: meetingId },
        });
      } catch (err) {
        console.warn('[MeetingContext] Failed to trigger Edge Function (may still work via DB trigger):', err);
        // Don't throw - the DB trigger may still invoke the function
      }
      
      console.log('[MeetingContext] Audio uploaded and processing queued');
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting'] });
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
      const { error } = await supabase.functions.invoke('process-recording', {
        body: { meeting_id: meetingId },
      });
      
      if (error) {
        console.error('[MeetingContext] Error retrying processing:', error);
        throw new Error('Failed to retry processing');
      }
      
      console.log('[MeetingContext] Retry triggered');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting'] });
    },
  });

  return {
    meetings: meetingsQuery.data || [],
    isLoading: meetingsQuery.isLoading,
    activeMeetingId,
    setActiveMeetingId,
    
    // Actions
    createMeeting: createMeetingMutation.mutateAsync,
    uploadAudio: uploadAudioMutation.mutateAsync,
    updateMeeting: updateMeetingMutation.mutateAsync,
    deleteMeeting: deleteMeetingMutation.mutateAsync,
    retryProcessing: retryProcessingMutation.mutateAsync,
    
    // Loading states
    isCreating: createMeetingMutation.isPending,
    isUploading: uploadAudioMutation.isPending,
    isUpdating: updateMeetingMutation.isPending,
    isDeleting: deleteMeetingMutation.isPending,
    isRetrying: retryProcessingMutation.isPending,
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
      
      return {
        ...meeting,
        transcript: transcript || undefined,
        segments: segments || undefined,
        processing_job: processingJob || undefined,
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
