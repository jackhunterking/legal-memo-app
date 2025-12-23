/**
 * Supabase Edge Function: get-assemblyai-token
 * 
 * Securely provides AssemblyAI API key to authenticated clients.
 * This keeps the API key server-side while allowing the mobile app
 * to establish WebSocket connections for real-time transcription.
 */

/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify the user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Supabase client to verify token
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify the user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error("[get-assemblyai-token] Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[get-assemblyai-token] Token requested by user: ${user.id}`);

    // Get AssemblyAI API key from environment
    const assemblyAIKey = Deno.env.get("ASSEMBLYAI_API_KEY");
    
    if (!assemblyAIKey) {
      console.error("[get-assemblyai-token] ASSEMBLYAI_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AssemblyAI API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Return the token
    // Note: In production, you might want to:
    // - Generate temporary tokens with AssemblyAI's token API
    // - Add rate limiting
    // - Log usage for billing purposes
    return new Response(
      JSON.stringify({
        token: assemblyAIKey,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("[get-assemblyai-token] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

