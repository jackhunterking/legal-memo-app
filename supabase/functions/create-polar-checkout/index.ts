/**
 * Create Polar Checkout Session
 * 
 * Creates a Polar checkout URL for web-based subscription purchase.
 * Opens in Safari (external browser) to comply with Apple guidelines.
 * 
 * After successful checkout, Polar redirects to the Universal Link
 * which opens the app and triggers subscription refresh.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Polar API base URL
const POLAR_API_BASE = "https://api.polar.sh/v1";

interface CreateCheckoutRequest {
  price_id?: string; // Optional - will use default from env if not provided
  success_url?: string; // Optional - will use app's Universal Link if not provided
}

interface PolarCheckoutResponse {
  id: string;
  url: string;
  status: string;
  customer_id?: string;
  metadata?: Record<string, string>;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("[create-polar-checkout] ========== CREATING CHECKOUT ==========");

  try {
    // Get authorization header to identify the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client with user's token
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("[create-polar-checkout] Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[create-polar-checkout] User ID:", user.id);
    console.log("[create-polar-checkout] User email:", user.email);

    // Parse request body
    const body: CreateCheckoutRequest = await req.json().catch(() => ({}));

    // Get Polar access token
    const polarAccessToken = Deno.env.get("POLAR_ACCESS_TOKEN");
    if (!polarAccessToken) {
      console.error("[create-polar-checkout] POLAR_ACCESS_TOKEN not configured");
      return new Response(
        JSON.stringify({ error: "Payment system not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get product price ID from request or environment
    const priceId = body.price_id || Deno.env.get("POLAR_PRODUCT_PRICE_ID");
    if (!priceId) {
      console.error("[create-polar-checkout] No price_id provided and POLAR_PRODUCT_PRICE_ID not set");
      return new Response(
        JSON.stringify({ error: "Product not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build success URL - this is the Universal Link that opens the app
    // Format: https://use.legalmemo.app/checkout/success
    const successUrl = body.success_url || "https://use.legalmemo.app/checkout/success";

    // Create checkout session with Polar API
    const checkoutPayload = {
      product_price_id: priceId,
      success_url: successUrl,
      customer_email: user.email,
      metadata: {
        supabase_user_id: user.id,
        user_email: user.email || "",
      },
    };

    console.log("[create-polar-checkout] Creating checkout with payload:", JSON.stringify(checkoutPayload, null, 2));

    const polarResponse = await fetch(`${POLAR_API_BASE}/checkouts/custom/`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${polarAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(checkoutPayload),
    });

    if (!polarResponse.ok) {
      const errorText = await polarResponse.text();
      console.error("[create-polar-checkout] Polar API error:", polarResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to create checkout session", details: errorText }),
        { status: polarResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const checkoutData: PolarCheckoutResponse = await polarResponse.json();
    console.log("[create-polar-checkout] Checkout created:", checkoutData.id);
    console.log("[create-polar-checkout] Checkout URL:", checkoutData.url);

    // Optionally: Store the pending checkout in the database for tracking
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

    // Update profile with Polar customer ID if available
    if (checkoutData.customer_id) {
      await adminSupabase
        .from("profiles")
        .update({ polar_customer_id: checkoutData.customer_id })
        .eq("id", user.id);
    }

    console.log("[create-polar-checkout] ========== CHECKOUT CREATED ==========");

    return new Response(
      JSON.stringify({
        success: true,
        checkout_id: checkoutData.id,
        checkout_url: checkoutData.url,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[create-polar-checkout] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

