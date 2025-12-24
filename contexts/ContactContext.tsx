import createContextHook from '@nkzw/create-context-hook';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import type { Contact, ContactCategory, ContactWithCategory, Meeting, ContactBillingSummary } from '@/types';

export const [ContactProvider, useContacts] = createContextHook(() => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ============================================
  // CONTACT CATEGORIES
  // ============================================

  // Fetch all contact categories for the user
  const contactCategoriesQuery = useQuery({
    queryKey: ['contactCategories', user?.id],
    queryFn: async (): Promise<ContactCategory[]> => {
      if (!user?.id) return [];
      console.log('[ContactContext] Fetching contact categories...');
      
      const { data, error } = await supabase
        .from('contact_categories')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true });
      
      if (error) {
        console.error('[ContactContext] Error fetching contact categories:', error.message);
        return [];
      }
      
      console.log('[ContactContext] Fetched', data?.length, 'contact categories');
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Create a new contact category
  const createContactCategoryMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }): Promise<ContactCategory> => {
      if (!user?.id) throw new Error('Not authenticated');
      console.log('[ContactContext] Creating contact category:', name);
      
      // Get the max display_order to put new category at the end
      const currentCategories = contactCategoriesQuery.data || [];
      const maxOrder = currentCategories.length > 0 
        ? Math.max(...currentCategories.map(c => c.display_order)) 
        : 0;
      
      const { data, error } = await supabase
        .from('contact_categories')
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
        console.error('[ContactContext] Error creating contact category:', error.message);
        throw new Error(error.message || 'Failed to create contact category');
      }
      
      console.log('[ContactContext] Created contact category:', data.id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contactCategories', user?.id] });
    },
  });

  // Update a contact category
  const updateContactCategoryMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ContactCategory> }): Promise<ContactCategory> => {
      console.log('[ContactContext] Updating contact category:', id, updates);
      
      const { data, error } = await supabase
        .from('contact_categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error('[ContactContext] Error updating contact category:', error.message);
        throw new Error(error.message || 'Failed to update contact category');
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contactCategories', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['contacts', user?.id] });
    },
  });

  // Delete a contact category
  const deleteContactCategoryMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      console.log('[ContactContext] Deleting contact category:', id);
      
      // First, clear category_id from any contacts using this category
      await supabase
        .from('contacts')
        .update({ category_id: null })
        .eq('category_id', id);
      
      const { error } = await supabase
        .from('contact_categories')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('[ContactContext] Error deleting contact category:', error.message);
        throw new Error(error.message || 'Failed to delete contact category');
      }
      
      console.log('[ContactContext] Contact category deleted');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contactCategories', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['contacts', user?.id] });
    },
  });

  // ============================================
  // CONTACTS
  // ============================================

  // Fetch all contacts for the user
  const contactsQuery = useQuery({
    queryKey: ['contacts', user?.id],
    queryFn: async (): Promise<ContactWithCategory[]> => {
      if (!user?.id) return [];
      console.log('[ContactContext] Fetching contacts...');
      
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          category:contact_categories(*)
        `)
        .eq('user_id', user.id)
        .order('first_name', { ascending: true });
      
      if (error) {
        console.error('[ContactContext] Error fetching contacts:', error.message);
        return [];
      }
      
      console.log('[ContactContext] Fetched', data?.length, 'contacts');
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Create a new contact
  const createContactMutation = useMutation({
    mutationFn: async (contactData: {
      first_name: string;
      last_name?: string | null;
      company?: string | null;
      email?: string | null;
      phone?: string | null;
      notes?: string | null;
      category_id?: string | null;
    }): Promise<Contact> => {
      if (!user?.id) throw new Error('Not authenticated');
      console.log('[ContactContext] Creating contact:', contactData.first_name);
      
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          user_id: user.id,
          ...contactData,
        })
        .select()
        .single();
      
      if (error) {
        console.error('[ContactContext] Error creating contact:', error.message);
        throw new Error(error.message || 'Failed to create contact');
      }
      
      console.log('[ContactContext] Created contact:', data.id);
      return data;
    },
    onSuccess: () => {
      // Invalidate contacts list to show the new contact
      queryClient.invalidateQueries({ queryKey: ['contacts', user?.id] });
      // Also invalidate individual contact queries
      queryClient.invalidateQueries({ queryKey: ['contact'] });
    },
  });

  // Update a contact
  const updateContactMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Contact> }): Promise<Contact> => {
      console.log('[ContactContext] Updating contact:', id, updates);
      
      const { data, error } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error('[ContactContext] Error updating contact:', error.message);
        throw new Error(error.message || 'Failed to update contact');
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['contact'] });
    },
  });

  // Delete a contact
  const deleteContactMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      console.log('[ContactContext] Deleting contact:', id);
      
      // Note: meetings.contact_id will be set to NULL automatically via ON DELETE SET NULL
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('[ContactContext] Error deleting contact:', error.message);
        throw new Error(error.message || 'Failed to delete contact');
      }
      
      console.log('[ContactContext] Contact deleted');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['meetings', user?.id] });
    },
  });

  return {
    // Contact categories data
    contactCategories: contactCategoriesQuery.data || [],
    isContactCategoriesLoading: contactCategoriesQuery.isLoading,
    refetchContactCategories: contactCategoriesQuery.refetch,
    
    // Contact category actions
    createContactCategory: createContactCategoryMutation.mutateAsync,
    updateContactCategory: updateContactCategoryMutation.mutateAsync,
    deleteContactCategory: deleteContactCategoryMutation.mutateAsync,
    
    // Contact category loading states
    isCreatingCategory: createContactCategoryMutation.isPending,
    isUpdatingCategory: updateContactCategoryMutation.isPending,
    isDeletingCategory: deleteContactCategoryMutation.isPending,
    
    // Contacts data
    contacts: contactsQuery.data || [],
    isContactsLoading: contactsQuery.isLoading,
    isContactsRefreshing: contactsQuery.isRefetching,
    refetchContacts: contactsQuery.refetch,
    
    // Contact actions
    createContact: createContactMutation.mutateAsync,
    updateContact: updateContactMutation.mutateAsync,
    deleteContact: deleteContactMutation.mutateAsync,
    
    // Contact loading states
    isCreatingContact: createContactMutation.isPending,
    isUpdatingContact: updateContactMutation.isPending,
    isDeletingContact: deleteContactMutation.isPending,
  };
});

// ============================================
// CONTACT DETAILS HOOK
// ============================================

export function useContactDetails(contactId: string | null) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['contact', contactId, user?.id],
    queryFn: async (): Promise<ContactWithCategory | null> => {
      if (!contactId || !user?.id) return null;
      console.log('[ContactContext] Fetching contact details:', contactId);
      
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          category:contact_categories(*)
        `)
        .eq('id', contactId)
        .eq('user_id', user.id)
        .single();
      
      if (error) {
        console.error('[ContactContext] Error fetching contact:', error.message);
        return null;
      }
      
      return data;
    },
    enabled: !!contactId && !!user?.id,
  });
}

// ============================================
// CONTACT MEETINGS HOOK
// ============================================

export function useContactMeetings(contactId: string | null) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['contactMeetings', contactId, user?.id],
    queryFn: async (): Promise<Meeting[]> => {
      if (!contactId || !user?.id) return [];
      console.log('[ContactContext] Fetching meetings for contact:', contactId);
      
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('contact_id', contactId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('[ContactContext] Error fetching contact meetings:', error.message);
        return [];
      }
      
      console.log('[ContactContext] Fetched', data?.length, 'meetings for contact');
      return data || [];
    },
    enabled: !!contactId && !!user?.id,
  });
}

// ============================================
// CONTACT BILLING SUMMARY HOOK
// ============================================

export function useContactBillingSummary(contactId: string | null) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['contactBillingSummary', contactId, user?.id],
    queryFn: async (): Promise<ContactBillingSummary | null> => {
      if (!contactId || !user?.id) return null;
      console.log('[ContactContext] Fetching billing summary for contact:', contactId);
      
      const { data, error } = await supabase
        .from('meetings')
        .select('billable_hours, billable_amount')
        .eq('contact_id', contactId)
        .eq('user_id', user.id)
        .eq('is_billable', true);
      
      if (error) {
        console.error('[ContactContext] Error fetching billing summary:', error.message);
        return null;
      }
      
      // Calculate totals
      const summary: ContactBillingSummary = {
        totalHours: 0,
        totalAmount: 0,
        billableMeetingsCount: data?.length || 0,
      };
      
      if (data && data.length > 0) {
        data.forEach((meeting) => {
          summary.totalHours += meeting.billable_hours || 0;
          summary.totalAmount += meeting.billable_amount || 0;
        });
      }
      
      console.log('[ContactContext] Billing summary:', summary);
      return summary;
    },
    enabled: !!contactId && !!user?.id,
  });
}

