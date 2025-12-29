/**
 * Polar Customer Portal Handler - Direct API Version
 * 
 * Creates a Polar customer portal session and redirects to the portal.
 * Uses direct API calls (same pattern as polar-checkout).
 * 
 * Authentication:
 * - Requires Authorization header with Supabase JWT
 * - Verifies user and looks up their Polar customer ID from profiles table
 * 
 * Environment Variables:
 * - POLAR_MODE: "production" (default) or "sandbox"
 * - POLAR_ACCESS_TOKEN: Production API token
 * - POLAR_SANDBOX_ACCESS_TOKEN: Sandbox API token
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_ANON_KEY: Supabase anonymous key
 * 
 * @see https://polar.sh/docs/api-reference/customer-portal/sessions/create
 */

import { createClient } from "npm:@supabase/supabase-js@2";

// API URLs for production and sandbox
const POLAR_PRODUCTION_API_URL = "https://api.polar.sh/v1";
const POLAR_SANDBOX_API_URL = "https://sandbox-api.polar.sh/v1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const FETCH_TIMEOUT_MS = 10000; // 10 second timeout

/**
 * Get the appropriate API URL and access token based on POLAR_MODE
 */
function getPolarConfig(): { apiUrl: string; accessToken: string | undefined; mode: string } {
  const mode = Deno.env.get("POLAR_MODE") || "production";
  
  if (mode === "sandbox") {
    return {
      apiUrl: POLAR_SANDBOX_API_URL,
      accessToken: Deno.env.get("POLAR_SANDBOX_ACCESS_TOKEN"),
      mode: "sandbox",
    };
  }
  
  return {
    apiUrl: POLAR_PRODUCTION_API_URL,
    accessToken: Deno.env.get("POLAR_ACCESS_TOKEN"),
    mode: "production",
  };
}

Deno.serve(async (req: Request) => {
  const { apiUrl, accessToken, mode } = getPolarConfig();
  
  console.log("[polar-customer-portal] Request received:", req.method, req.url);
  console.log("[polar-customer-portal] Mode:", mode);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    // Check Polar access token
    if (!accessToken) {
      const tokenName = mode === "sandbox" ? "POLAR_SANDBOX_ACCESS_TOKEN" : "POLAR_ACCESS_TOKEN";
      console.error(`[polar-customer-portal] ${tokenName} not set`);
      return new Response(JSON.stringify({ error: `Configuration error: Missing ${tokenName}` }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Extract the Supabase JWT from the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[polar-customer-portal] No Authorization header");
      return new Response(JSON.stringify({ error: "Missing authorization header" }), { 
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const token = authHeader.replace("Bearer ", "");
    console.log("[polar-customer-portal] Supabase token received, length:", token.length);
    
    // Initialize Supabase client with the token to verify user
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    
    // Verify the user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[polar-customer-portal] Auth error:", authError?.message);
      return new Response(JSON.stringify({ error: "User not authenticated" }), { 
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    console.log("[polar-customer-portal] Authenticated user:", user.id);
    
    // Get the Polar Customer ID from the user's profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("polar_customer_id")
      .eq("id", user.id)
      .single();
      
    if (profileError) {
      console.error("[polar-customer-portal] Profile error:", profileError.message);
      return new Response(JSON.stringify({ error: "Could not fetch user profile" }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    if (!profile?.polar_customer_id) {
      console.error("[polar-customer-portal] No polar_customer_id for user:", user.id);
      return new Response(JSON.stringify({ error: "No subscription found for this user" }), { 
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const customerId = profile.polar_customer_id;
    console.log("[polar-customer-portal] Polar Customer ID:", customerId);

    // Create customer session via Polar API
    console.log("[polar-customer-portal] Creating customer session...");
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`${apiUrl}/customer-sessions/`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer_id: customerId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log("[polar-customer-portal] Polar API response status:", response.status);
      const responseText = await response.text();
      console.log("[polar-customer-portal] Polar API response:", responseText.substring(0, 500));

      if (!response.ok) {
        return new Response(JSON.stringify({ error: `Portal creation failed: ${responseText}` }), { 
          status: response.status,
          headers: { "Content-Type": "application/json" }
        });
      }

      const session = JSON.parse(responseText);
      const portalUrl = session.customer_portal_url;
      
      if (!portalUrl) {
        console.error("[polar-customer-portal] No portal URL in response:", session);
        return new Response(JSON.stringify({ error: "No portal URL returned from Polar" }), { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      console.log("[polar-customer-portal] Success! Redirecting to:", portalUrl);

      // Return redirect to the portal
      return new Response(null, {
        status: 302,
        headers: {
          "Location": portalUrl,
        },
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        console.error("[polar-customer-portal] Fetch timeout after", FETCH_TIMEOUT_MS, "ms");
        return new Response(JSON.stringify({ error: "Polar API timeout - please try again" }), { 
          status: 504,
          headers: { "Content-Type": "application/json" }
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error("[polar-customer-portal] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
