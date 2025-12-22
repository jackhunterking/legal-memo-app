import createContextHook from '@nkzw/create-context-hook';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { MeetingTask } from '@/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const [TaskProvider, useTasks] = createContextHook(() => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const requestPermissions = async () => {
    if (Platform.OS === 'web') return true;
    
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    return finalStatus === 'granted';
  };

  const scheduleNotification = async (task: MeetingTask) => {
    if (!task.reminder_time || Platform.OS === 'web') return null;

    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        console.log('[TaskContext] Notification permission denied');
        return null;
      }

      const reminderDate = new Date(task.reminder_time);
      const now = new Date();
      
      if (reminderDate <= now) {
        console.log('[TaskContext] Reminder time is in the past');
        return null;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Task Reminder',
          body: task.title,
          data: { taskId: task.id, meetingId: task.meeting_id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderDate,
        } as Notifications.DateTriggerInput,
      });

      console.log('[TaskContext] Notification scheduled:', notificationId);
      return notificationId;
    } catch (error) {
      console.error('[TaskContext] Error scheduling notification:', error);
      return null;
    }
  };

  const cancelNotification = async (notificationId: string | null) => {
    if (!notificationId || Platform.OS === 'web') return;

    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      console.log('[TaskContext] Notification cancelled:', notificationId);
    } catch (error) {
      console.error('[TaskContext] Error cancelling notification:', error);
    }
  };

  const createTaskMutation = useMutation({
    mutationFn: async (task: Partial<MeetingTask> & { meeting_id: string }) => {
      if (!user?.id) throw new Error('Not authenticated');
      console.log('[TaskContext] Creating task...');

      const { data, error } = await supabase
        .from('meeting_tasks')
        .insert({
          meeting_id: task.meeting_id,
          user_id: user.id,
          title: task.title,
          description: task.description,
          priority: task.priority || 'medium',
          completed: task.completed || false,
          reminder_time: task.reminder_time,
          owner: task.owner,
        })
        .select()
        .single();

      if (error) {
        console.error('[TaskContext] Error creating task:', error);
        throw error;
      }

      if (data.reminder_time) {
        const notificationId = await scheduleNotification(data);
        if (notificationId) {
          await supabase
            .from('meeting_tasks')
            .update({ notification_id: notificationId })
            .eq('id', data.id);
          data.notification_id = notificationId;
        }
      }

      console.log('[TaskContext] Task created:', data.id);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.meeting_id] });
      queryClient.invalidateQueries({ queryKey: ['meeting', variables.meeting_id] });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<MeetingTask> }) => {
      console.log('[TaskContext] Updating task:', taskId);

      const { data: currentTask } = await supabase
        .from('meeting_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (currentTask?.notification_id) {
        await cancelNotification(currentTask.notification_id);
      }

      const { data, error } = await supabase
        .from('meeting_tasks')
        .update(updates)
        .eq('id', taskId)
        .select()
        .single();

      if (error) {
        console.error('[TaskContext] Error updating task:', error);
        throw error;
      }

      if (data.reminder_time && !data.completed) {
        const notificationId = await scheduleNotification(data);
        if (notificationId) {
          await supabase
            .from('meeting_tasks')
            .update({ notification_id: notificationId })
            .eq('id', data.id);
          data.notification_id = notificationId;
        }
      }

      console.log('[TaskContext] Task updated');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', data.meeting_id] });
      queryClient.invalidateQueries({ queryKey: ['meeting', data.meeting_id] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      console.log('[TaskContext] Deleting task:', taskId);

      const { data: task } = await supabase
        .from('meeting_tasks')
        .select('notification_id, meeting_id')
        .eq('id', taskId)
        .single();

      if (task?.notification_id) {
        await cancelNotification(task.notification_id);
      }

      const { error } = await supabase
        .from('meeting_tasks')
        .delete()
        .eq('id', taskId);

      if (error) {
        console.error('[TaskContext] Error deleting task:', error);
        throw error;
      }

      console.log('[TaskContext] Task deleted');
      return task?.meeting_id;
    },
    onSuccess: (meetingId) => {
      if (meetingId) {
        queryClient.invalidateQueries({ queryKey: ['tasks', meetingId] });
        queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] });
      }
    },
  });

  return {
    createTask: createTaskMutation.mutateAsync,
    updateTask: updateTaskMutation.mutateAsync,
    deleteTask: deleteTaskMutation.mutateAsync,
    isCreating: createTaskMutation.isPending,
    isUpdating: updateTaskMutation.isPending,
    isDeleting: deleteTaskMutation.isPending,
  };
});

export function useMeetingTasks(meetingId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['tasks', meetingId, user?.id],
    queryFn: async (): Promise<MeetingTask[]> => {
      if (!meetingId || !user?.id) return [];
      console.log('[TaskContext] Fetching tasks for meeting:', meetingId);

      const { data, error } = await supabase
        .from('meeting_tasks')
        .select('*')
        .eq('meeting_id', meetingId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[TaskContext] Error fetching tasks:', error);
        return [];
      }

      return data || [];
    },
    enabled: !!meetingId && !!user?.id,
  });
}
