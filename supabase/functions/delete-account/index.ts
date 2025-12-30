/**
 * Delete Account Edge Function
 * 
 * Handles complete account deletion for App Store compliance.
 * Deletes all user data including:
 * - Meetings and transcripts
 * - Audio files from storage
 * - Contacts and categories
 * - Meeting types
 * - Profile data
 * - Usage records
 * - Subscription data (Polar customer ID)
 * - Auth user account
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface DeleteAccountRequest {
  confirmation: string; // Must be "DELETE" to confirm
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body: DeleteAccountRequest = await req.json();
    
    // Require explicit confirmation
    if (body.confirmation !== "DELETE") {
      return new Response(JSON.stringify({ 
        error: "Invalid confirmation. Please send { confirmation: 'DELETE' } to confirm account deletion." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase client with user's JWT
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // User client to verify the token
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client for deletion operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    
    if (userError || !user) {
      console.error("[DeleteAccount] Auth error:", userError);
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    console.log(`[DeleteAccount] Starting deletion for user: ${userId}`);

    // Step 1: Get all meeting IDs for this user (need for storage cleanup)
    const { data: meetings } = await supabaseAdmin
      .from("meetings")
      .select("id, audio_path")
      .eq("user_id", userId);

    const meetingIds = meetings?.map(m => m.id) || [];
    const audioPaths = meetings?.filter(m => m.audio_path).map(m => m.audio_path) || [];

    console.log(`[DeleteAccount] Found ${meetingIds.length} meetings, ${audioPaths.length} audio files`);

    // Step 2: Delete audio files from storage
    if (audioPaths.length > 0) {
      console.log("[DeleteAccount] Deleting audio files...");
      const { error: storageError } = await supabaseAdmin.storage
        .from("meeting-audio")
        .remove(audioPaths);
      
      if (storageError) {
        console.error("[DeleteAccount] Storage deletion error:", storageError);
        // Continue anyway - don't block account deletion
      }
    }

    // Step 3: Delete transcript segments (child of transcripts)
    if (meetingIds.length > 0) {
      console.log("[DeleteAccount] Deleting transcript segments...");
      await supabaseAdmin
        .from("transcript_segments")
        .delete()
        .in("meeting_id", meetingIds);
    }

    // Step 4: Delete transcripts
    if (meetingIds.length > 0) {
      console.log("[DeleteAccount] Deleting transcripts...");
      await supabaseAdmin
        .from("transcripts")
        .delete()
        .in("meeting_id", meetingIds);
    }

    // Step 5: Delete processing jobs
    if (meetingIds.length > 0) {
      console.log("[DeleteAccount] Deleting processing jobs...");
      await supabaseAdmin
        .from("processing_jobs")
        .delete()
        .in("meeting_id", meetingIds);
    }

    // Step 6: Delete meeting shares
    if (meetingIds.length > 0) {
      console.log("[DeleteAccount] Deleting meeting shares...");
      await supabaseAdmin
        .from("meeting_shares")
        .delete()
        .in("meeting_id", meetingIds);
    }

    // Step 7: Delete meetings
    console.log("[DeleteAccount] Deleting meetings...");
    await supabaseAdmin
      .from("meetings")
      .delete()
      .eq("user_id", userId);

    // Step 8: Delete contacts
    console.log("[DeleteAccount] Deleting contacts...");
    await supabaseAdmin
      .from("contacts")
      .delete()
      .eq("user_id", userId);

    // Step 9: Delete contact categories
    console.log("[DeleteAccount] Deleting contact categories...");
    await supabaseAdmin
      .from("contact_categories")
      .delete()
      .eq("user_id", userId);

    // Step 10: Delete meeting types
    console.log("[DeleteAccount] Deleting meeting types...");
    await supabaseAdmin
      .from("meeting_types")
      .delete()
      .eq("user_id", userId);

    // Step 11: Delete usage records
    console.log("[DeleteAccount] Deleting usage records...");
    await supabaseAdmin
      .from("usage")
      .delete()
      .eq("user_id", userId);

    // Step 12: Delete subscriptions
    console.log("[DeleteAccount] Deleting subscriptions...");
    await supabaseAdmin
      .from("subscriptions")
      .delete()
      .eq("user_id", userId);

    // Step 13: Delete profile
    console.log("[DeleteAccount] Deleting profile...");
    await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", userId);

    // Step 14: Delete the auth user (this must be last)
    console.log("[DeleteAccount] Deleting auth user...");
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    if (deleteUserError) {
      console.error("[DeleteAccount] Error deleting auth user:", deleteUserError);
      return new Response(JSON.stringify({ 
        error: "Failed to delete user account. Please contact support.",
        details: deleteUserError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[DeleteAccount] Successfully deleted account for user: ${userId}`);

    return new Response(JSON.stringify({ 
      success: true,
      message: "Your account and all associated data have been permanently deleted." 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[DeleteAccount] Unexpected error:", error);
    return new Response(JSON.stringify({ 
      error: "An unexpected error occurred. Please try again or contact support.",
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

