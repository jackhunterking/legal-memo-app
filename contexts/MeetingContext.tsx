import createContextHook from '@nkzw/create-context-hook';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import type { Meeting, MeetingWithDetails } from '@/types';

export const [MeetingProvider, useMeetings] = createContextHook(() => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

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
      
      const { data, error } = await supabase
        .from('meetings')
        .insert({
          user_id: user.id,
          auto_title: autoTitle,
          meeting_type: 'General Legal Meeting',
          status: 'recording',
          billable: profile?.last_billable_setting ?? false,
          billable_seconds: 0,
          hourly_rate_snapshot: profile?.default_hourly_rate ?? 250,
          duration_seconds: 0,
        })
        .select()
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
      durationSeconds,
      startedAt,
      endedAt,
    }: {
      meetingId: string;
      audioPath: string;
      durationSeconds: number;
      startedAt: string;
      endedAt: string;
    }) => {
      console.log('[MeetingContext] Finalizing upload for meeting:', meetingId);
      
      const { error } = await supabase
        .from('meetings')
        .update({
          audio_path: audioPath,
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
      
      console.log('[MeetingContext] Upload finalized, processing queued');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
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
      
      await supabase
        .from('meetings')
        .update({ status: 'processing', error_message: null })
        .eq('id', meetingId);
      
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
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
    updateMeeting: updateMeetingMutation.mutateAsync,
    updateMeetingDetails: (meetingId: string, updates: Partial<Meeting>) => 
      updateMeetingMutation.mutateAsync({ meetingId, updates }),
    deleteMeeting: deleteMeetingMutation.mutateAsync,
    retryProcessing: retryProcessingMutation.mutateAsync,
    
    isCreating: createInstantMeetingMutation.isPending,
    isUploading: finalizeUploadMutation.isPending,
    isUpdating: updateMeetingMutation.isPending,
    isDeleting: deleteMeetingMutation.isPending,
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
        .select('*')
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
      if (data?.status === 'processing' || data?.status === 'uploading') {
        return 3000;
      }
      return false;
    },
  });
}
