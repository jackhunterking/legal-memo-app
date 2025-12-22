// Supabase Edge Function for migrating existing WebM recordings
// This function finds all WebM recordings and triggers transcoding for each

/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MeetingToMigrate {
  id: string;
  audio_path: string;
  audio_format?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[Migration] Starting WebM migration...");

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find all meetings that have WebM format and haven't been transcoded yet
    // Check both by audio_format column and by file extension
    const { data: webmMeetings, error: fetchError } = await supabase
      .from("meetings")
      .select("id, audio_path, audio_format")
      .not("audio_path", "is", null)
      .or("audio_format.eq.webm,audio_path.ilike.%.webm")
      .neq("audio_format", "transcoding") // Don't re-trigger if already transcoding
      .neq("audio_format", "m4a") // Skip if already converted
      .limit(10); // Process in batches to avoid timeout

    if (fetchError) {
      console.error("[Migration] Error fetching meetings:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch meetings" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!webmMeetings || webmMeetings.length === 0) {
      console.log("[Migration] No WebM recordings found to migrate");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No WebM recordings found to migrate",
          processed: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[Migration] Found ${webmMeetings.length} WebM recordings to migrate`
    );

    const results: Array<{
      meetingId: string;
      status: "queued" | "error";
      error?: string;
    }> = [];

    // Mark each meeting as transcoding and trigger the transcode function
    for (const meeting of webmMeetings as MeetingToMigrate[]) {
      try {
        console.log(`[Migration] Processing meeting: ${meeting.id}`);

        // Update to transcoding status
        await supabase
          .from("meetings")
          .update({ audio_format: "transcoding" })
          .eq("id", meeting.id);

        // Trigger the transcode-audio function
        const { error: invokeError } = await supabase.functions.invoke(
          "transcode-audio",
          {
            body: {
              meetingId: meeting.id,
              audioPath: meeting.audio_path,
            },
          }
        );

        if (invokeError) {
          console.error(
            `[Migration] Failed to trigger transcoding for ${meeting.id}:`,
            invokeError
          );
          results.push({
            meetingId: meeting.id,
            status: "error",
            error: invokeError.message,
          });

          // Mark as failed if we couldn't trigger transcoding
          await supabase
            .from("meetings")
            .update({ audio_format: "failed" })
            .eq("id", meeting.id);
        } else {
          console.log(
            `[Migration] Successfully queued transcoding for ${meeting.id}`
          );
          results.push({ meetingId: meeting.id, status: "queued" });
        }
      } catch (err) {
        console.error(`[Migration] Error processing meeting ${meeting.id}:`, err);
        results.push({
          meetingId: meeting.id,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const successCount = results.filter((r) => r.status === "queued").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    console.log(
      `[Migration] Migration complete. Queued: ${successCount}, Errors: ${errorCount}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Migration complete. Queued ${successCount} recordings for transcoding.`,
        processed: webmMeetings.length,
        queued: successCount,
        errors: errorCount,
        results,
        hasMore: webmMeetings.length === 10, // Indicates there might be more to process
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Migration] Error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Migration failed",
        details: String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
