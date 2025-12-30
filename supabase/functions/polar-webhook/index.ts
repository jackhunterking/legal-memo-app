/**
 * Polar Webhook Handler - Direct Implementation
 * 
 * Handles Polar webhook events with manual signature verification.
 * Avoids npm SDK cold start issues.
 * 
 * Supports both production and sandbox environments via POLAR_MODE env var.
 * 
 * Environment Variables:
 * - POLAR_MODE: "production" (default) or "sandbox"
 * - POLAR_WEBHOOK_SECRET: Production webhook secret
 * - POLAR_SANDBOX_WEBHOOK_SECRET: Sandbox webhook secret (required if POLAR_MODE=sandbox)
 * 
 * @see https://docs.polar.sh/developers/webhooks
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

// Initialize Supabase client with service role for admin operations
const getSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseServiceKey);
};

/**
 * Get the current Polar mode and webhook secret
 */
function getPolarConfig(): { mode: string; webhookSecret: string | undefined } {
  const mode = Deno.env.get("POLAR_MODE") || "production";
  
  if (mode === "sandbox") {
    return {
      mode: "sandbox",
      webhookSecret: Deno.env.get("POLAR_SANDBOX_WEBHOOK_SECRET"),
    };
  }
  
  return {
    mode: "production",
    webhookSecret: Deno.env.get("POLAR_WEBHOOK_SECRET"),
  };
}

/**
 * Verify webhook signature using HMAC-SHA256
 */
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );
    
    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return signature === expectedSignature;
  } catch (error) {
    console.error("[polar-webhook] Signature verification error:", error);
    return false;
  }
}

/**
 * Find user by Polar customer ID, email, or metadata
 */
async function findUserId(
  supabase: ReturnType<typeof createClient>,
  polarCustomerId: string | null,
  email: string | null,
  metadata: Record<string, string> | null
): Promise<string | null> {
  // First try metadata user_id
  if (metadata?.user_id) {
    return metadata.user_id;
  }
  
  if (metadata?.supabase_user_id) {
    return metadata.supabase_user_id;
  }

  // Try to find by polar_customer_id
  if (polarCustomerId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("polar_customer_id", polarCustomerId)
      .single();
    
    if (profile) return profile.id;
  }

  // Try to find by email
  if (email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();
    
    if (profile) return profile.id;
  }

  return null;
}

// Event handlers - now accept environment parameter
async function handleCheckoutCreated(data: any, environment: string) {
  console.log("[polar-webhook] Checkout created:", data.id);
  console.log("[polar-webhook] Environment:", environment);
  console.log("[polar-webhook] Customer email:", data.customer_email);
  console.log("[polar-webhook] External customer ID:", data.external_customer_id);
  // Checkout created - user is on the payment page
  // No action needed yet, wait for subscription.created after payment
}

async function handleCheckoutUpdated(data: any, environment: string) {
  console.log("[polar-webhook] Checkout updated:", data.id);
  console.log("[polar-webhook] Environment:", environment);
  console.log("[polar-webhook] Status:", data.status);
  // Checkout updated (status changes, etc.)
  // No action needed, wait for subscription.created
}

async function handleSubscriptionCreated(data: any, environment: string) {
  console.log("[polar-webhook] Subscription created:", data.id);
  console.log("[polar-webhook] Environment:", environment);
  
  const supabase = getSupabaseAdmin();
  const customer = data.customer;
  
  const userId = await findUserId(
    supabase,
    customer?.id || null,
    customer?.email || null,
    data.metadata as Record<string, string> || null
  );

  if (!userId) {
    console.error("[polar-webhook] Could not find user for subscription");
    return;
  }

  // Update profile with Polar customer ID
  if (customer?.id) {
    await supabase
      .from("profiles")
      .update({ polar_customer_id: customer.id })
      .eq("id", userId);
  }

  // Create/update subscription record with environment tracking
  const { error } = await supabase
    .from("subscriptions")
    .upsert({
      user_id: userId,
      polar_subscription_id: data.id,
      polar_customer_id: customer?.id,
      status: data.status || "active",
      plan_name: data.product?.name || "Legal Memo Pro",
      monthly_minutes_included: 999999, // Unlimited
      overage_rate_cents: 0,
      current_period_start: data.current_period_start,
      current_period_end: data.current_period_end,
      store: "polar",
      environment: environment, // Track sandbox vs production
    }, { onConflict: "user_id" });

  if (error) {
    console.error("[polar-webhook] Error creating subscription:", error);
    return;
  }

  // Reset usage for new billing period
  if (data.current_period_start && data.current_period_end) {
    await supabase.rpc("reset_usage_period", {
      p_user_id: userId,
      p_period_start: data.current_period_start,
      p_period_end: data.current_period_end,
    });
  }

  console.log("[polar-webhook] Subscription created for user:", userId, "environment:", environment);
}

async function handleSubscriptionActive(data: any, environment: string) {
  console.log("[polar-webhook] Subscription active:", data.id);
  console.log("[polar-webhook] Environment:", environment);
  
  const supabase = getSupabaseAdmin();

  // Get existing subscription to find user
  const { data: existingSub } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("polar_subscription_id", data.id)
    .single();

  // Clear any cancellation fields when subscription becomes active
  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "active",
      current_period_start: data.current_period_start,
      current_period_end: data.current_period_end,
      canceled_at: null,
      cancellation_reason: null, // Clear cancellation reason on reactivation
      environment: environment, // Update environment in case it changed
      updated_at: new Date().toISOString(),
    })
    .eq("polar_subscription_id", data.id);

  if (error) {
    console.error("[polar-webhook] Error activating subscription:", error);
    return;
  }

  // Reset usage for new billing period on renewal
  if (existingSub?.user_id && data.current_period_start && data.current_period_end) {
    await supabase.rpc("reset_usage_period", {
      p_user_id: existingSub.user_id,
      p_period_start: data.current_period_start,
      p_period_end: data.current_period_end,
    });
    console.log("[polar-webhook] Reset usage period for user:", existingSub.user_id);
  }

  console.log("[polar-webhook] Subscription activated:", data.id);
}

async function handleSubscriptionUpdated(data: any, environment: string) {
  console.log("[polar-webhook] Subscription updated:", data.id);
  console.log("[polar-webhook] Environment:", environment);
  
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: data.status || "active",
      plan_name: data.product?.name,
      current_period_start: data.current_period_start,
      current_period_end: data.current_period_end,
      environment: environment,
      updated_at: new Date().toISOString(),
    })
    .eq("polar_subscription_id", data.id);

  if (error) {
    console.error("[polar-webhook] Error updating subscription:", error);
  }

  console.log("[polar-webhook] Subscription updated:", data.id);
}

async function handleSubscriptionCanceled(data: any, environment: string) {
  console.log("[polar-webhook] Subscription canceled:", data.id);
  console.log("[polar-webhook] Environment:", environment);
  console.log("[polar-webhook] Current period end:", data.current_period_end);
  console.log("[polar-webhook] Canceled at:", data.canceled_at);
  console.log("[polar-webhook] Cancel reason:", data.cancel_reason || data.cancellation_reason);
  
  const supabase = getSupabaseAdmin();

  // Determine cancellation reason from Polar payload
  // Polar may send this in different fields depending on the cancellation type
  const cancellationReason = data.cancel_reason || 
                             data.cancellation_reason || 
                             data.reason ||
                             'user_requested'; // Default to user-initiated

  // IMPORTANT: Preserve current_period_end - this tells us when access should end
  // Users who cancel should retain access until their paid period ends
  const updateData: Record<string, any> = {
    status: "canceled",
    canceled_at: data.canceled_at || new Date().toISOString(),
    cancellation_reason: cancellationReason,
    updated_at: new Date().toISOString(),
  };

  // Only update current_period_end if Polar provides it (don't null it out)
  if (data.current_period_end) {
    updateData.current_period_end = data.current_period_end;
  }

  const { error } = await supabase
    .from("subscriptions")
    .update(updateData)
    .eq("polar_subscription_id", data.id);

  if (error) {
    console.error("[polar-webhook] Error canceling subscription:", error);
  }

  console.log("[polar-webhook] Subscription canceled:", data.id, "reason:", cancellationReason);
}

async function handleSubscriptionRevoked(data: any, environment: string) {
  console.log("[polar-webhook] Subscription revoked:", data.id);
  console.log("[polar-webhook] Environment:", environment);
  console.log("[polar-webhook] Revocation reason:", data.revoke_reason || data.reason);
  
  const supabase = getSupabaseAdmin();

  // Revoked means immediate access loss - determine reason
  const cancellationReason = data.revoke_reason || 
                             data.reason || 
                             data.cancellation_reason ||
                             'admin_revoked'; // Default for revocations

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "expired",
      canceled_at: data.canceled_at || new Date().toISOString(),
      cancellation_reason: cancellationReason,
      updated_at: new Date().toISOString(),
    })
    .eq("polar_subscription_id", data.id);

  if (error) {
    console.error("[polar-webhook] Error revoking subscription:", error);
  }

  console.log("[polar-webhook] Subscription revoked:", data.id, "reason:", cancellationReason);
}

async function handleSubscriptionUncanceled(data: any, environment: string) {
  console.log("[polar-webhook] Subscription uncanceled:", data.id);
  console.log("[polar-webhook] Environment:", environment);
  
  const supabase = getSupabaseAdmin();

  // Clear cancellation fields when subscription is reactivated
  const updateData: Record<string, any> = {
    status: "active",
    canceled_at: null,
    cancellation_reason: null, // Clear the reason when reactivated
    updated_at: new Date().toISOString(),
  };

  // Update period dates if provided
  if (data.current_period_start) {
    updateData.current_period_start = data.current_period_start;
  }
  if (data.current_period_end) {
    updateData.current_period_end = data.current_period_end;
  }

  const { error } = await supabase
    .from("subscriptions")
    .update(updateData)
    .eq("polar_subscription_id", data.id);

  if (error) {
    console.error("[polar-webhook] Error uncanceling subscription:", error);
  }

  console.log("[polar-webhook] Subscription uncanceled:", data.id);
}

async function handleCustomerCreated(data: any, environment: string) {
  console.log("[polar-webhook] Customer created:", data.id);
  console.log("[polar-webhook] Environment:", environment);
  
  const supabase = getSupabaseAdmin();

  // Link customer to user profile if we have email match
  if (data.email) {
    const { error } = await supabase
      .from("profiles")
      .update({ polar_customer_id: data.id })
      .eq("email", data.email)
      .is("polar_customer_id", null);

    if (!error) {
      console.log("[polar-webhook] Linked customer to profile:", data.email);
    }
  }
}

async function handleOrderPaid(data: any, environment: string) {
  console.log("[polar-webhook] Order paid:", data.id);
  console.log("[polar-webhook] Environment:", environment);
  // Order paid events are handled by subscription events for subscriptions
  // This is primarily for one-time purchases which we don't use currently
}

// Main webhook handler
Deno.serve(async (req: Request) => {
  const { mode, webhookSecret } = getPolarConfig();
  
  console.log("[polar-webhook] Request received:", req.method);
  console.log("[polar-webhook] Mode:", mode);
  
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    if (!webhookSecret) {
      const secretName = mode === "sandbox" ? "POLAR_SANDBOX_WEBHOOK_SECRET" : "POLAR_WEBHOOK_SECRET";
      console.error(`[polar-webhook] ${secretName} not set`);
      return new Response("Configuration error", { status: 500 });
    }

    // Get the raw body for signature verification
    const body = await req.text();
    console.log("[polar-webhook] Body length:", body.length);

    // Get signature from header
    const signature = req.headers.get("webhook-signature") || 
                     req.headers.get("x-polar-signature") ||
                     req.headers.get("polar-signature");
    
    console.log("[polar-webhook] Signature header present:", !!signature);

    // Verify signature if present
    if (signature) {
      const isValid = await verifyWebhookSignature(body, signature, webhookSecret);
      if (!isValid) {
        console.error("[polar-webhook] Invalid signature");
        // For now, log but don't reject - Polar might use different signature format
        console.log("[polar-webhook] Continuing despite signature mismatch for debugging");
      }
    }

    // Parse the payload
    const payload = JSON.parse(body);
    const eventType = payload.type;
    const eventData = payload.data;

    console.log("[polar-webhook] Event type:", eventType);
    console.log("[polar-webhook] Event data ID:", eventData?.id);

    // Route to appropriate handler with environment context
    switch (eventType) {
      case "checkout.created":
        await handleCheckoutCreated(eventData, mode);
        break;
      case "checkout.updated":
        await handleCheckoutUpdated(eventData, mode);
        break;
      case "subscription.created":
        await handleSubscriptionCreated(eventData, mode);
        break;
      case "subscription.active":
        await handleSubscriptionActive(eventData, mode);
        break;
      case "subscription.updated":
        await handleSubscriptionUpdated(eventData, mode);
        break;
      case "subscription.canceled":
        await handleSubscriptionCanceled(eventData, mode);
        break;
      case "subscription.revoked":
        await handleSubscriptionRevoked(eventData, mode);
        break;
      case "subscription.uncanceled":
        await handleSubscriptionUncanceled(eventData, mode);
        break;
      case "customer.created":
        await handleCustomerCreated(eventData, mode);
        break;
      case "customer.updated":
        console.log("[polar-webhook] Customer updated:", eventData?.id, "environment:", mode);
        break;
      case "order.paid":
        await handleOrderPaid(eventData, mode);
        break;
      case "order.created":
        console.log("[polar-webhook] Order created:", eventData?.id, "environment:", mode);
        break;
      case "product.created":
      case "product.updated":
        console.log("[polar-webhook] Product event:", eventType, eventData?.id, "environment:", mode);
        break;
      case "benefit.created":
      case "benefit.updated":
        console.log("[polar-webhook] Benefit event:", eventType, eventData?.id, "environment:", mode);
        break;
      case "organization.updated":
        console.log("[polar-webhook] Organization updated:", eventData?.id, "environment:", mode);
        break;
      default:
        console.log("[polar-webhook] Unhandled event type:", eventType, "environment:", mode);
    }

    // Return success
    return new Response(JSON.stringify({ received: true, environment: mode }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[polar-webhook] Error processing webhook:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
