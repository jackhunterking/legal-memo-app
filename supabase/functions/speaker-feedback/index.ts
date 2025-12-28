/**
 * Supabase Edge Function: speaker-feedback
 * 
 * Handles user feedback submissions for speaker diarization issues.
 * Stores feedback in the speaker_feedback table for analysis and improvement.
 * 
 * Endpoint: POST /speaker-feedback
 * Auth: Required (Bearer token)
 * Body: { meeting_id, feedback_type, notes? }
 */

/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Valid feedback types (must match database constraint)
const VALID_FEEDBACK_TYPES = [
  'wrong_speaker_count',
  'speakers_merged',
  'speakers_split',
  'wrong_attribution',
  'other',
] as const;

type FeedbackType = typeof VALID_FEEDBACK_TYPES[number];

interface FeedbackRequest {
  meeting_id: string;
  feedback_type?: FeedbackType;
  notes?: string;
}

interface FeedbackResponse {
  success: boolean;
  feedback_id?: string;
  message: string;
}

// Helper to create JSON response
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Helper to create error response
function errorResponse(message: string, status = 400) {
  console.error(`[speaker-feedback] Error (${status}): ${message}`);
  return jsonResponse({ success: false, error: message }, status);
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  console.log("[speaker-feedback] === Request received ===");

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse("Server configuration error: Missing Supabase credentials", 500);
    }

    // Get the auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse("Missing or invalid Authorization header", 401);
    }

    const jwt = authHeader.replace("Bearer ", "");

    // Create Supabase client for auth validation
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Validate user token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);

    if (userError || !user) {
      console.error("[speaker-feedback] Auth error:", userError);
      return errorResponse("Authentication failed", 401);
    }

    const userId = user.id;
    console.log("[speaker-feedback] User authenticated:", userId);

    // Parse request body
    let body: FeedbackRequest;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON in request body", 400);
    }

    // Validate required fields
    const { meeting_id, feedback_type, notes } = body;

    if (!meeting_id) {
      return errorResponse("Missing required field: meeting_id", 400);
    }

    // Ensure at least one meaningful field is provided (feedback_type or notes)
    const hasNotes = notes && notes.trim().length > 0;
    if (!feedback_type && !hasNotes) {
      return errorResponse(
        "At least one of 'feedback_type' or 'notes' must be provided",
        400
      );
    }

    // Validate feedback_type if provided
    if (feedback_type && !VALID_FEEDBACK_TYPES.includes(feedback_type)) {
      return errorResponse(
        `Invalid feedback_type. Must be one of: ${VALID_FEEDBACK_TYPES.join(', ')}`,
        400
      );
    }

    console.log(`[speaker-feedback] Processing feedback for meeting: ${meeting_id}`);
    console.log(`[speaker-feedback] Feedback type: ${feedback_type || 'none (notes only)'}`);
    console.log(`[speaker-feedback] Has notes: ${hasNotes}`);

    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify the meeting exists and belongs to the user
    const { data: meeting, error: meetingError } = await supabaseAdmin
      .from("meetings")
      .select("id, user_id, expected_speakers, detected_speakers")
      .eq("id", meeting_id)
      .single();

    if (meetingError || !meeting) {
      console.error("[speaker-feedback] Meeting not found:", meetingError);
      return errorResponse("Meeting not found", 404);
    }

    if (meeting.user_id !== userId) {
      console.warn("[speaker-feedback] User doesn't own this meeting");
      return errorResponse("You don't have permission to submit feedback for this meeting", 403);
    }

    // Get speaker counts from meeting (optional - only include if relevant)
    const expectedSpeakers = meeting.expected_speakers || null;
    const detectedSpeakers = meeting.detected_speakers || null;

    if (expectedSpeakers !== null && detectedSpeakers !== null) {
      console.log(`[speaker-feedback] Expected: ${expectedSpeakers}, Detected: ${detectedSpeakers}`);
    }

    // Build insert object with only provided fields
    const insertData: {
      meeting_id: string;
      user_id: string;
      feedback_type?: FeedbackType;
      expected_speakers?: number | null;
      detected_speakers?: number | null;
      notes?: string | null;
      status: string;
    } = {
      meeting_id,
      user_id: userId,
      status: 'pending',
    };

    // Only include feedback_type if provided
    if (feedback_type) {
      insertData.feedback_type = feedback_type;
    }

    // Only include speaker counts if both are available
    if (expectedSpeakers !== null && detectedSpeakers !== null) {
      insertData.expected_speakers = expectedSpeakers;
      insertData.detected_speakers = detectedSpeakers;
    }

    // Only include notes if provided
    if (hasNotes) {
      insertData.notes = notes;
    }

    // Insert feedback record
    const { data: feedback, error: insertError } = await supabaseAdmin
      .from("speaker_feedback")
      .insert(insertData)
      .select("id")
      .single();

    if (insertError) {
      console.error("[speaker-feedback] Error inserting feedback:", insertError);
      return errorResponse("Failed to save feedback", 500);
    }

    console.log(`[speaker-feedback] Feedback saved with ID: ${feedback.id}`);

    const response: FeedbackResponse = {
      success: true,
      feedback_id: feedback.id,
      message: "Thank you for your feedback. We'll use it to improve speaker detection.",
    };

    return jsonResponse(response);

  } catch (error) {
    console.error("[speaker-feedback] Unexpected error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
});

