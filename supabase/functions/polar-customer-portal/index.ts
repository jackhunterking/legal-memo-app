/**
 * Polar Customer Portal Handler
 * 
 * Uses the official @polar-sh/supabase SDK for customer portal access.
 * Redirects users to their Polar subscription management portal.
 * 
 * Supports both production and sandbox environments via POLAR_MODE env var.
 * 
 * Authentication:
 * - Requires Authorization header with Supabase JWT
 * - Verifies user and looks up their Polar customer ID from profiles table
 * 
 * Environment Variables:
 * - POLAR_MODE: "production" (default) or "sandbox"
 * - POLAR_ACCESS_TOKEN: Production API token
 * - POLAR_SANDBOX_ACCESS_TOKEN: Sandbox API token (required if POLAR_MODE=sandbox)
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_ANON_KEY: Supabase anonymous key
 * 
 * @see https://polar.sh/docs/integrate/sdk/adapters/supabase
 */

import { CustomerPortal } from "npm:@polar-sh/supabase";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

/**
 * Get the appropriate configuration based on POLAR_MODE
 */
function getPolarConfig(): { accessToken: string; server: "production" | "sandbox" } {
  const mode = Deno.env.get("POLAR_MODE") || "production";
  
  if (mode === "sandbox") {
    return {
      accessToken: Deno.env.get("POLAR_SANDBOX_ACCESS_TOKEN") || "",
      server: "sandbox",
    };
  }
  
  return {
    accessToken: Deno.env.get("POLAR_ACCESS_TOKEN") || "",
    server: "production",
  };
}

// Get config at startup
const config = getPolarConfig();

console.log("[polar-customer-portal] Initializing with mode:", config.server);
console.log("[polar-customer-portal] Token exists:", !!config.accessToken);
console.log("[polar-customer-portal] Supabase URL exists:", !!SUPABASE_URL);

export const GET = CustomerPortal({
  accessToken: config.accessToken,
  returnUrl: "https://use.legalmemo.app",
  server: config.server,
  
  /**
   * Resolve Polar customer ID from authenticated Supabase user
   * Per Polar docs: Extract JWT, verify user, return customer ID
   * @see https://polar.sh/docs/integrate/sdk/adapters/supabase
   */
  getCustomerId: async (req: Request) => {
    console.log("[polar-customer-portal] Processing request...");
    
    // Extract the Supabase JWT from the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[polar-customer-portal] No Authorization header");
      throw new Error("Missing authorization header");
    }
    
    const token = authHeader.replace("Bearer ", "");
    console.log("[polar-customer-portal] Token received, length:", token.length);
    
    // Initialize Supabase client with the token to verify user
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    
    // Verify the user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[polar-customer-portal] Auth error:", authError?.message);
      throw new Error("User not authenticated");
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
      throw new Error("Could not fetch user profile");
    }
    
    if (!profile?.polar_customer_id) {
      console.error("[polar-customer-portal] No polar_customer_id for user:", user.id);
      throw new Error("No subscription found for this user");
    }
    
    console.log("[polar-customer-portal] Polar Customer ID:", profile.polar_customer_id);
    console.log("[polar-customer-portal] Server mode:", config.server);
    
    return profile.polar_customer_id;
  },
});
