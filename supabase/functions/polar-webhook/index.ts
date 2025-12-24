/**
 * Polar Webhook Handler
 * 
 * Uses the official @polar-sh/supabase SDK for proper webhook handling.
 * Handles subscription events for billing integration.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Polar webhook event types
interface PolarCustomer {
  id: string;
  email: string;
  metadata?: Record<string, string>;
}

interface PolarSubscription {
  id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  customer_id: string;
  customer?: PolarCustomer;
  product?: {
    id: string;
    name: string;
  };
  canceled_at?: string;
  metadata?: Record<string, string>;
}

interface PolarWebhookEvent {
  type: string;
  data: PolarSubscription & {
    id: string;
    customer_id?: string;
    customer?: PolarCustomer;
  };
}

// Verify Polar webhook signature using Svix standard
async function verifyWebhookSignature(
  payload: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const webhookId = headers.get("webhook-id");
  const webhookTimestamp = headers.get("webhook-timestamp");
  const webhookSignature = headers.get("webhook-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    console.log("[polar-webhook] Missing webhook headers");
    return false;
  }

  try {
    // Polar uses Svix for webhooks - standard signature format
    const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;
    
    // Extract the base64 secret (remove "whsec_" prefix if present)
    const secretBytes = secret.startsWith("whsec_") 
      ? Uint8Array.from(atob(secret.slice(6)), c => c.charCodeAt(0))
      : new TextEncoder().encode(secret);

    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signedContent)
    );

    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

    // Webhook signature format: v1,<base64_signature>
    const signatures = webhookSignature.split(" ");
    for (const sig of signatures) {
      const [version, sigValue] = sig.split(",");
      if (version === "v1" && sigValue === expectedSignature) {
        return true;
      }
    }

    console.log("[polar-webhook] Signature mismatch");
    return false;
  } catch (error) {
    console.error("[polar-webhook] Signature verification error:", error);
    return false;
  }
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

  console.log("[polar-webhook] ========== WEBHOOK RECEIVED ==========");

  try {
    // Get raw body for signature verification
    const rawBody = await req.text();
    console.log("[polar-webhook] Raw body length:", rawBody.length);

    // Verify webhook signature
    const webhookSecret = Deno.env.get("POLAR_WEBHOOK_SECRET");

    if (webhookSecret) {
      const isValid = await verifyWebhookSignature(rawBody, req.headers, webhookSecret);
      if (!isValid) {
        console.error("[polar-webhook] Invalid webhook signature");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log("[polar-webhook] Signature verified successfully");
    } else {
      console.warn("[polar-webhook] POLAR_WEBHOOK_SECRET not set - skipping signature verification");
    }

    // Parse the webhook payload
    const event: PolarWebhookEvent = JSON.parse(rawBody);
    console.log("[polar-webhook] Event type:", event.type);
    console.log("[polar-webhook] Event data:", JSON.stringify(event.data, null, 2));

    // Initialize Supabase client with service role for admin operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different event types
    switch (event.type) {
      case "subscription.created":
        await handleSubscriptionCreated(supabase, event);
        break;

      case "subscription.updated":
        await handleSubscriptionUpdated(supabase, event);
        break;

      case "subscription.canceled":
        await handleSubscriptionCanceled(supabase, event);
        break;

      case "subscription.active":
        await handleSubscriptionActive(supabase, event);
        break;

      case "subscription.revoked":
        await handleSubscriptionRevoked(supabase, event);
        break;

      case "checkout.created":
      case "checkout.updated":
        console.log("[polar-webhook] Checkout event - no action needed");
        break;

      case "order.created":
      case "order.paid":
        console.log("[polar-webhook] Order event - handled by subscription events");
        break;

      default:
        console.log("[polar-webhook] Unhandled event type:", event.type);
    }

    console.log("[polar-webhook] ========== WEBHOOK PROCESSED ==========");

    return new Response(
      JSON.stringify({ success: true, event_type: event.type }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[polar-webhook] Error processing webhook:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Handle subscription.created event
 */
async function handleSubscriptionCreated(supabase: ReturnType<typeof createClient>, event: PolarWebhookEvent) {
  console.log("[polar-webhook] Processing subscription.created");

  const subscription = event.data;
  const polarCustomerId = subscription.customer?.id || subscription.customer_id;
  const polarSubscriptionId = subscription.id;
  const customerEmail = subscription.customer?.email;
  const userIdFromMetadata = subscription.customer?.metadata?.user_id || subscription.metadata?.user_id;

  if (!polarCustomerId || !polarSubscriptionId) {
    console.error("[polar-webhook] Missing customer_id or subscription_id");
    return;
  }

  // Find the user by email or metadata
  let userId = userIdFromMetadata;

  if (!userId && customerEmail) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", customerEmail)
      .single();

    if (profile) {
      userId = profile.id;
    }
  }

  // Try to find by polar_customer_id
  if (!userId) {
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("polar_customer_id", polarCustomerId)
      .single();

    if (existingProfile) {
      userId = existingProfile.id;
    }
  }

  if (!userId) {
    console.error("[polar-webhook] Could not determine user_id for subscription");
    return;
  }

  // Update profile with Polar customer ID
  await supabase
    .from("profiles")
    .update({ polar_customer_id: polarCustomerId })
    .eq("id", userId);

  // Create subscription record
  const subscriptionData = {
    user_id: userId,
    polar_subscription_id: polarSubscriptionId,
    polar_customer_id: polarCustomerId,
    status: subscription.status || "active",
    plan_name: subscription.product?.name || "AI Legal Note-Taking App Access",
    monthly_minutes_included: 10,
    overage_rate_cents: 100,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end,
  };

  const { error: subError } = await supabase
    .from("subscriptions")
    .upsert(subscriptionData, { onConflict: "user_id" });

  if (subError) {
    console.error("[polar-webhook] Error creating subscription:", subError);
    return;
  }

  // Reset usage for new billing period
  if (subscription.current_period_start && subscription.current_period_end) {
    await supabase.rpc("reset_usage_period", {
      p_user_id: userId,
      p_period_start: subscription.current_period_start,
      p_period_end: subscription.current_period_end,
    });
  }

  console.log("[polar-webhook] Subscription created for user:", userId);
}

/**
 * Handle subscription.updated event
 */
async function handleSubscriptionUpdated(supabase: ReturnType<typeof createClient>, event: PolarWebhookEvent) {
  console.log("[polar-webhook] Processing subscription.updated");

  const subscription = event.data;
  const polarSubscriptionId = subscription.id;

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: subscription.status || "active",
      plan_name: subscription.product?.name,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq("polar_subscription_id", polarSubscriptionId);

  if (error) {
    console.error("[polar-webhook] Error updating subscription:", error);
  }

  console.log("[polar-webhook] Subscription updated:", polarSubscriptionId);
}

/**
 * Handle subscription.canceled event
 */
async function handleSubscriptionCanceled(supabase: ReturnType<typeof createClient>, event: PolarWebhookEvent) {
  console.log("[polar-webhook] Processing subscription.canceled");

  const subscription = event.data;
  const polarSubscriptionId = subscription.id;

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      canceled_at: subscription.canceled_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("polar_subscription_id", polarSubscriptionId);

  if (error) {
    console.error("[polar-webhook] Error canceling subscription:", error);
  }

  console.log("[polar-webhook] Subscription canceled:", polarSubscriptionId);
}

/**
 * Handle subscription.active event (renewal)
 */
async function handleSubscriptionActive(supabase: ReturnType<typeof createClient>, event: PolarWebhookEvent) {
  console.log("[polar-webhook] Processing subscription.active");

  const subscription = event.data;
  const polarSubscriptionId = subscription.id;

  // Get the subscription to find user_id
  const { data: existingSub } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("polar_subscription_id", polarSubscriptionId)
    .single();

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "active",
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq("polar_subscription_id", polarSubscriptionId);

  if (error) {
    console.error("[polar-webhook] Error activating subscription:", error);
    return;
  }

  // Reset usage period on renewal
  if (existingSub?.user_id && subscription.current_period_start && subscription.current_period_end) {
    await supabase.rpc("reset_usage_period", {
      p_user_id: existingSub.user_id,
      p_period_start: subscription.current_period_start,
      p_period_end: subscription.current_period_end,
    });
    console.log("[polar-webhook] Reset usage period for user:", existingSub.user_id);
  }

  console.log("[polar-webhook] Subscription activated:", polarSubscriptionId);
}

/**
 * Handle subscription.revoked event
 */
async function handleSubscriptionRevoked(supabase: ReturnType<typeof createClient>, event: PolarWebhookEvent) {
  console.log("[polar-webhook] Processing subscription.revoked");

  const subscription = event.data;
  const polarSubscriptionId = subscription.id;

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("polar_subscription_id", polarSubscriptionId);

  if (error) {
    console.error("[polar-webhook] Error revoking subscription:", error);
  }

  console.log("[polar-webhook] Subscription revoked:", polarSubscriptionId);
}
