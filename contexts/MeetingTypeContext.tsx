import createContextHook from '@nkzw/create-context-hook';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import type { MeetingType } from '@/types';

export const [MeetingTypeProvider, useMeetingTypes] = createContextHook(() => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all active meeting types for the current user
  const meetingTypesQuery = useQuery({
    queryKey: ['meeting-types', user?.id],
    queryFn: async (): Promise<MeetingType[]> => {
      if (!user?.id) return [];
      console.log('[MeetingTypeContext] Fetching meeting types...');
      
      const { data, error } = await supabase
        .from('meeting_types')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      if (error) {
        console.error('[MeetingTypeContext] Error fetching meeting types:', error.message || JSON.stringify(error));
        if (error.code === '42P01' || error.code === 'PGRST116') {
          console.log('[MeetingTypeContext] Meeting types table may not exist yet');
          return [];
        }
        return [];
      }
      console.log('[MeetingTypeContext] Fetched', data?.length, 'meeting types');
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch all meeting types (including inactive) for settings management
  const allMeetingTypesQuery = useQuery({
    queryKey: ['meeting-types-all', user?.id],
    queryFn: async (): Promise<MeetingType[]> => {
      if (!user?.id) return [];
      console.log('[MeetingTypeContext] Fetching all meeting types...');
      
      const { data, error } = await supabase
        .from('meeting_types')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true });
      
      if (error) {
        console.error('[MeetingTypeContext] Error fetching all meeting types:', error.message || JSON.stringify(error));
        return [];
      }
      console.log('[MeetingTypeContext] Fetched', data?.length, 'meeting types (including inactive)');
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Create a new meeting type
  const createMeetingTypeMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }): Promise<MeetingType> => {
      if (!user?.id) throw new Error('Not authenticated');
      console.log('[MeetingTypeContext] Creating meeting type:', name, color);
      
      // Get the highest display_order to add the new type at the end
      const { data: existingTypes } = await supabase
        .from('meeting_types')
        .select('display_order')
        .eq('user_id', user.id)
        .order('display_order', { ascending: false })
        .limit(1);
      
      const maxOrder = existingTypes?.[0]?.display_order || 0;
      
      const { data, error } = await supabase
        .from('meeting_types')
        .insert({
          user_id: user.id,
          name: name.trim(),
          color,
          is_active: true,
          is_default: false,
          display_order: maxOrder + 1,
        })
        .select()
        .single();
      
      if (error) {
        console.error('[MeetingTypeContext] Error creating meeting type:', error.message || JSON.stringify(error));
        if (error.code === '23505') {
          throw new Error('A meeting type with this name already exists');
        }
        throw new Error(error.message || 'Failed to create meeting type');
      }
      console.log('[MeetingTypeContext] Created meeting type:', data.id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-types'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-types-all'] });
    },
  });

  // Update a meeting type
  const updateMeetingTypeMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<MeetingType, 'name' | 'color' | 'is_active' | 'display_order'>>;
    }): Promise<MeetingType> => {
      console.log('[MeetingTypeContext] Updating meeting type:', id, updates);
      
      // Trim name if it's being updated
      const finalUpdates = updates.name ? { ...updates, name: updates.name.trim() } : updates;
      
      const { data, error } = await supabase
        .from('meeting_types')
        .update(finalUpdates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error('[MeetingTypeContext] Error updating meeting type:', error.message || JSON.stringify(error));
        if (error.code === '23505') {
          throw new Error('A meeting type with this name already exists');
        }
        throw new Error(error.message || 'Failed to update meeting type');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-types'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-types-all'] });
    },
  });

  // Soft delete a meeting type
  const deleteMeetingTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      console.log('[MeetingTypeContext] Soft deleting meeting type:', id);
      
      const { error } = await supabase
        .from('meeting_types')
        .update({ is_active: false })
        .eq('id', id);
      
      if (error) {
        console.error('[MeetingTypeContext] Error deleting meeting type:', error.message || JSON.stringify(error));
        throw new Error(error.message || 'Failed to delete meeting type');
      }
      console.log('[MeetingTypeContext] Meeting type soft deleted');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-types'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-types-all'] });
    },
  });

  // Reorder meeting types
  const reorderMeetingTypesMutation = useMutation({
    mutationFn: async (types: MeetingType[]) => {
      console.log('[MeetingTypeContext] Reordering meeting types...');
      
      // Update display_order for each type
      const updates = types.map((type, index) => 
        supabase
          .from('meeting_types')
          .update({ display_order: index + 1 })
          .eq('id', type.id)
      );
      
      const results = await Promise.all(updates);
      const errors = results.filter(r => r.error);
      
      if (errors.length > 0) {
        console.error('[MeetingTypeContext] Error reordering meeting types:', errors);
        throw new Error('Failed to reorder meeting types');
      }
      
      console.log('[MeetingTypeContext] Meeting types reordered');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-types'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-types-all'] });
    },
  });

  return {
    meetingTypes: meetingTypesQuery.data || [],
    allMeetingTypes: allMeetingTypesQuery.data || [],
    isLoading: meetingTypesQuery.isLoading,
    isLoadingAll: allMeetingTypesQuery.isLoading,
    
    createMeetingType: createMeetingTypeMutation.mutateAsync,
    updateMeetingType: updateMeetingTypeMutation.mutateAsync,
    deleteMeetingType: deleteMeetingTypeMutation.mutateAsync,
    reorderMeetingTypes: reorderMeetingTypesMutation.mutateAsync,
    
    isCreating: createMeetingTypeMutation.isPending,
    isUpdating: updateMeetingTypeMutation.isPending,
    isDeleting: deleteMeetingTypeMutation.isPending,
    isReordering: reorderMeetingTypesMutation.isPending,
  };
});

