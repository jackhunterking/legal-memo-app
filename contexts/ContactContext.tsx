import React, { createContext, useContext, ReactNode, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Contact, ContactRole } from "@/types";
import { useAuth } from "./AuthContext";

interface ContactContextValue {
  contacts: Contact[];
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  createContact: (data: CreateContactData) => Promise<Contact>;
  updateContact: (id: string, data: Partial<CreateContactData>) => Promise<Contact>;
  deleteContact: (id: string) => Promise<void>;
  getContactById: (id: string) => Contact | undefined;
  searchContacts: (query: string) => Contact[];
  refetch: () => void;
}

interface CreateContactData {
  full_name: string;
  role: ContactRole;
  company?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

const ContactContext = createContext<ContactContextValue | null>(null);

export function ContactProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const userId = user?.id;

  const { data: contacts = [], isLoading, refetch } = useQuery({
    queryKey: ["contacts", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      console.log("[ContactContext] Fetching contacts");
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("user_id", userId)
        .order("full_name", { ascending: true });

      if (error) {
        console.error("[ContactContext] Error fetching contacts:", error.message || JSON.stringify(error));
        // Return empty array if table doesn't exist or RLS issue
        if (error.code === '42P01' || error.code === 'PGRST116') {
          console.log("[ContactContext] Contacts table may not exist yet");
          return [];
        }
        return [];
      }

      console.log("[ContactContext] Fetched contacts:", data?.length);
      return data as Contact[];
    },
    enabled: !!userId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateContactData) => {
      if (!user) throw new Error("No user");

      console.log("[ContactContext] Creating contact:", data.full_name);
      const { data: contact, error } = await supabase
        .from("contacts")
        .insert({
          user_id: user.id,
          full_name: data.full_name,
          role: data.role,
          company: data.company || null,
          phone: data.phone || null,
          email: data.email || null,
          notes: data.notes || null,
        })
        .select()
        .single();

      if (error) {
        console.error("[ContactContext] Error creating contact:", error.message || JSON.stringify(error));
        throw new Error(error.message || "Failed to create contact");
      }

      console.log("[ContactContext] Contact created:", contact.id);
      return contact as Contact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateContactData> }) => {
      if (!user) throw new Error("No user");

      console.log("[ContactContext] Updating contact:", id);
      const { data: contact, error } = await supabase
        .from("contacts")
        .update({
          full_name: data.full_name,
          role: data.role,
          company: data.company !== undefined ? data.company || null : undefined,
          phone: data.phone !== undefined ? data.phone || null : undefined,
          email: data.email !== undefined ? data.email || null : undefined,
          notes: data.notes !== undefined ? data.notes || null : undefined,
        })
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        console.error("[ContactContext] Error updating contact:", error.message || JSON.stringify(error));
        throw new Error(error.message || "Failed to update contact");
      }

      console.log("[ContactContext] Contact updated:", contact.id);
      return contact as Contact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("No user");

      console.log("[ContactContext] Deleting contact:", id);
      const { error } = await supabase
        .from("contacts")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("[ContactContext] Error deleting contact:", error.message || JSON.stringify(error));
        throw new Error(error.message || "Failed to delete contact");
      }

      console.log("[ContactContext] Contact deleted:", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });

  const { mutateAsync: createAsync } = createMutation;
  const { mutateAsync: updateAsync } = updateMutation;
  const { mutateAsync: deleteAsync } = deleteMutation;

  const createContact = useCallback(
    async (data: CreateContactData): Promise<Contact> => {
      return createAsync(data);
    },
    [createAsync]
  );

  const updateContact = useCallback(
    async (id: string, data: Partial<CreateContactData>): Promise<Contact> => {
      return updateAsync({ id, data });
    },
    [updateAsync]
  );

  const deleteContact = useCallback(
    async (id: string): Promise<void> => {
      return deleteAsync(id);
    },
    [deleteAsync]
  );

  const getContactById = useCallback(
    (id: string): Contact | undefined => {
      return contacts.find((c) => c.id === id);
    },
    [contacts]
  );

  const searchContacts = useCallback(
    (query: string): Contact[] => {
      if (!query.trim()) return contacts;
      
      const lowerQuery = query.toLowerCase();
      return contacts.filter(
        (c) =>
          c.full_name.toLowerCase().includes(lowerQuery) ||
          c.email?.toLowerCase().includes(lowerQuery) ||
          c.phone?.includes(query) ||
          c.company?.toLowerCase().includes(lowerQuery)
      );
    },
    [contacts]
  );

  return (
    <ContactContext.Provider
      value={{
        contacts,
        isLoading,
        isCreating: createMutation.isPending,
        isUpdating: updateMutation.isPending,
        isDeleting: deleteMutation.isPending,
        createContact,
        updateContact,
        deleteContact,
        getContactById,
        searchContacts,
        refetch,
      }}
    >
      {children}
    </ContactContext.Provider>
  );
}

export function useContacts() {
  const context = useContext(ContactContext);
  if (!context) {
    throw new Error("useContacts must be used within ContactProvider");
  }
  return context;
}
