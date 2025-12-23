import createContextHook from '@nkzw/create-context-hook';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { useMeetingTypes } from './MeetingTypeContext';
import type { AudioFormat, Meeting, MeetingWithDetails } from '@/types';

export const [MeetingProvider, useMeetings] = createContextHook(() => {
  const { user, profile } = useAuth();
  const { meetingTypes } = useMeetingTypes();
  const queryClient = useQueryClient();
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

  const meetingsQuery = useQuery({
    queryKey: ['meetings', user?.id],
    queryFn: async (): Promise<Meeting[]> => {
      if (!user?.id) return [];
      console.log('[MeetingContext] Fetching meetings...');
      
      const { data, error } = await supabase
        .from('meetings')
        .select('*, meeting_type:meeting_types(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('[MeetingContext] Error fetching meetings:', error.message || JSON.stringify(error));
        if (error.code === '42P01' || error.code === 'PGRST116') {
          console.log('[MeetingContext] Meetings table may not exist yet');
          return [];
        }
        return [];
      }
      console.log('[MeetingContext] Fetched', data?.length, 'meetings');
      return data || [];
    },
    enabled: !!user?.id,
  });

  const createInstantMeetingMutation = useMutation({
    mutationFn: async (): Promise<Meeting> => {
      if (!user?.id) throw new Error('Not authenticated');
      console.log('[MeetingContext] Creating instant meeting...');
      
      const now = new Date();
      const autoTitle = `Meeting ${now.toISOString().split('T')[0]} ${now.toTimeString().slice(0, 5)}`;
      
      // Use the first active meeting type, or null if none available
      const defaultMeetingTypeId = meetingTypes[0]?.id || null;
      
      const { data, error } = await supabase
        .from('meetings')
        .insert({
          user_id: user.id,
          auto_title: autoTitle,
          meeting_type_id: defaultMeetingTypeId,
          status: 'recording',
          billable: profile?.last_billable_setting ?? false,
          billable_seconds: 0,
          hourly_rate_snapshot: profile?.default_hourly_rate ?? 250,
          duration_seconds: 0,
        })
        .select('*, meeting_type:meeting_types(*)')
        .single();
      
      if (error) {
        console.error('[MeetingContext] Error creating meeting:', error.message || JSON.stringify(error));
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

  const confirmConsentMutation = useMutation({
    mutationFn: async ({ 
      meetingId, 
      informedParticipants, 
      recordingLawful 
    }: { 
      meetingId: string; 
      informedParticipants: boolean; 
      recordingLawful: boolean; 
    }) => {
      if (!user?.id) throw new Error('Not authenticated');
      console.log('[MeetingContext] Confirming consent for meeting:', meetingId);
      
      const { error } = await supabase
        .from('meeting_consent_logs')
        .insert({
          meeting_id: meetingId,
          user_id: user.id,
          informed_participants: informedParticipants,
          recording_lawful: recordingLawful,
          consented_at: new Date().toISOString(),
        });
      
      if (error) {
        console.error('[MeetingContext] Error confirming consent:', error.message || JSON.stringify(error));
        throw new Error(error.message || 'Failed to confirm consent');
      }
      console.log('[MeetingContext] Consent confirmed');
    },
  });

  const finalizeUploadMutation = useMutation({
    mutationFn: async ({
      meetingId,
      audioPath,
      audioFormat,
      durationSeconds,
      startedAt,
      endedAt,
    }: {
      meetingId: string;
      audioPath: string;
      audioFormat: AudioFormat;
      durationSeconds: number;
      startedAt: string;
      endedAt: string;
    }) => {
      console.log('[MeetingContext] Finalizing upload for meeting:', meetingId, 'format:', audioFormat);
      
      // Determine the initial audio_format status
      // If it's webm, we'll need to trigger transcoding
      const initialFormat: AudioFormat = audioFormat === 'webm' ? 'transcoding' : audioFormat;
      
      const { error } = await supabase
        .from('meetings')
        .update({
          audio_path: audioPath,
          audio_format: initialFormat,
          duration_seconds: durationSeconds,
          billable_seconds: durationSeconds,
          started_at: startedAt,
          ended_at: endedAt,
          status: 'processing',
        })
        .eq('id', meetingId);
      
      if (error) {
        console.error('[MeetingContext] Error finalizing upload:', error.message || JSON.stringify(error));
        throw new Error(error.message || 'Failed to finalize upload');
      }
      
      const { error: jobError } = await supabase
        .from('meeting_jobs')
        .insert({
          meeting_id: meetingId,
          status: 'queued',
          attempts: 0,
        });
      
      if (jobError) console.error('[MeetingContext] Job creation error:', jobError);
      
      // If the audio is webm, trigger transcoding Edge Function
      if (audioFormat === 'webm') {
        console.log('[MeetingContext] WebM format detected, triggering transcoding...');
        try {
          const { error: transcodeError } = await supabase.functions.invoke('transcode-audio', {
            body: { meetingId, audioPath },
          });
          
          if (transcodeError) {
            console.error('[MeetingContext] Transcoding trigger error:', transcodeError);
            // Don't throw - transcoding failure shouldn't block the upload
          } else {
            console.log('[MeetingContext] Transcoding triggered successfully');
          }
        } catch (err) {
          console.error('[MeetingContext] Failed to trigger transcoding:', err);
          // Don't throw - we'll handle this gracefully in the UI
        }
      }
      
      console.log('[MeetingContext] Upload finalized, processing queued');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });

  // Trigger the process-meeting Edge Function
  const triggerProcessingMutation = useMutation({
    mutationFn: async (meetingId: string) => {
      console.log('[MeetingContext] Triggering AI processing for meeting:', meetingId);
      
      try {
        const { data, error } = await supabase.functions.invoke('process-meeting', {
          body: { meeting_id: meetingId },
        });
        
        if (error) {
          // Try to get more details from the error
          let errorMessage = 'Edge Function error';
          if ('context' in error && error.context) {
            try {
              const ctx = error.context as Response;
              const errorBody = await ctx.json();
              errorMessage = errorBody?.error || errorBody?.message || errorMessage;
              console.error('[MeetingContext] Edge Function error details:', errorBody);
            } catch {
              console.error('[MeetingContext] Could not parse error context');
            }
          }
          console.error('[MeetingContext] Error triggering processing:', errorMessage);
          // Don't throw - the meeting status will reflect the error from the Edge Function
          // The Edge Function updates the meeting status to 'failed' with error_message on error
          return { error: errorMessage };
        }
        
        console.log('[MeetingContext] Processing triggered successfully:', data);
        return data;
      } catch (err) {
        console.error('[MeetingContext] Failed to invoke Edge Function:', err);
        // Network error or function not deployed - don't throw, let UI handle gracefully
        return { error: 'Processing service unavailable. Please check Edge Function deployment.' };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting'] });
    },
  });

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
        console.error('[MeetingContext] Error updating meeting:', error.message || JSON.stringify(error));
        throw new Error(error.message || 'Failed to update meeting');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting'] });
    },
  });

  const deleteMeetingMutation = useMutation({
    mutationFn: async (meetingId: string) => {
      console.log('[MeetingContext] Deleting meeting:', meetingId);
      
      const { data: meeting } = await supabase
        .from('meetings')
        .select('audio_path')
        .eq('id', meetingId)
        .single();
      
      if (meeting?.audio_path) {
        await supabase.storage
          .from('meeting-audio')
          .remove([meeting.audio_path]);
      }
      
      await supabase.from('ai_outputs').delete().eq('meeting_id', meetingId);
      await supabase.from('transcript_segments').delete().eq('meeting_id', meetingId);
      await supabase.from('meeting_consent_logs').delete().eq('meeting_id', meetingId);
      await supabase.from('meeting_jobs').delete().eq('meeting_id', meetingId);
      
      const { error } = await supabase
        .from('meetings')
        .delete()
        .eq('id', meetingId);
      
      if (error) {
        console.error('[MeetingContext] Error deleting meeting:', error.message || JSON.stringify(error));
        throw new Error(error.message || 'Failed to delete meeting');
      }
      console.log('[MeetingContext] Meeting deleted');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });

  const retryProcessingMutation = useMutation({
    mutationFn: async (meetingId: string) => {
      console.log('[MeetingContext] Retrying processing for:', meetingId);
      
      // Update meeting status to processing
      await supabase
        .from('meetings')
        .update({ status: 'processing', error_message: null })
        .eq('id', meetingId);
      
      // Reset job status
      const { error } = await supabase
        .from('meeting_jobs')
        .upsert({
          meeting_id: meetingId,
          status: 'queued',
          attempts: 0,
          last_error: null,
          locked_at: null,
        });
      
      if (error) {
        console.error('[MeetingContext] Error retrying processing:', error.message || JSON.stringify(error));
        throw new Error(error.message || 'Failed to retry processing');
      }
      
      // Trigger the Edge Function
      await triggerProcessingMutation.mutateAsync(meetingId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting'] });
    },
  });

  const retryTranscodingMutation = useMutation({
    mutationFn: async (meetingId: string) => {
      console.log('[MeetingContext] Retrying transcoding for:', meetingId);
      
      // Get the meeting to find the audio path
      const { data: meeting, error: fetchError } = await supabase
        .from('meetings')
        .select('audio_path')
        .eq('id', meetingId)
        .single();
      
      if (fetchError || !meeting?.audio_path) {
        throw new Error('Could not find meeting audio');
      }
      
      // Update status to transcoding
      await supabase
        .from('meetings')
        .update({ audio_format: 'transcoding' })
        .eq('id', meetingId);
      
      // Trigger the transcoding Edge Function
      const { error } = await supabase.functions.invoke('transcode-audio', {
        body: { meetingId, audioPath: meeting.audio_path },
      });
      
      if (error) {
        console.error('[MeetingContext] Error retrying transcoding:', error);
        throw new Error(error.message || 'Failed to retry transcoding');
      }
      
      console.log('[MeetingContext] Transcoding retry triggered');
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
    
    createInstantMeeting: createInstantMeetingMutation.mutateAsync,
    confirmConsent: confirmConsentMutation.mutateAsync,
    finalizeUpload: finalizeUploadMutation.mutateAsync,
    triggerProcessing: triggerProcessingMutation.mutateAsync,
    updateMeeting: updateMeetingMutation.mutateAsync,
    updateMeetingDetails: (meetingId: string, updates: Partial<Meeting>) => 
      updateMeetingMutation.mutateAsync({ meetingId, updates }),
    deleteMeeting: deleteMeetingMutation.mutateAsync,
    retryProcessing: retryProcessingMutation.mutateAsync,
    retryTranscoding: retryTranscodingMutation.mutateAsync,
    
    isCreating: createInstantMeetingMutation.isPending,
    isUploading: finalizeUploadMutation.isPending,
    isUpdating: updateMeetingMutation.isPending,
    isDeleting: deleteMeetingMutation.isPending,
    isTranscoding: retryTranscodingMutation.isPending,
    isProcessing: triggerProcessingMutation.isPending,
  };
});

export function useMeetingDetails(meetingId: string | null) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['meeting', meetingId, user?.id],
    queryFn: async (): Promise<MeetingWithDetails | null> => {
      if (!meetingId || !user?.id) return null;
      console.log('[MeetingContext] Fetching meeting details:', meetingId);
      
      const { data: meeting, error } = await supabase
        .from('meetings')
        .select('*, meeting_type:meeting_types(*)')
        .eq('id', meetingId)
        .eq('user_id', user.id)
        .single();
      
      if (error) {
        console.error('[MeetingContext] Error fetching meeting details:', error.message || JSON.stringify(error));
        return null;
      }
      
      const { data: aiOutput } = await supabase
        .from('ai_outputs')
        .select('*')
        .eq('meeting_id', meetingId)
        .single();
      
      const { data: segments } = await supabase
        .from('transcript_segments')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('start_ms', { ascending: true });
      
      return {
        ...meeting,
        ai_output: aiOutput || undefined,
        transcript_segments: segments || undefined,
      };
    },
    enabled: !!meetingId && !!user?.id,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll when processing, uploading, or transcoding audio
      if (data?.status === 'processing' || data?.status === 'uploading' || data?.audio_format === 'transcoding') {
        return 3000;
      }
      return false;
    },
  });
}
