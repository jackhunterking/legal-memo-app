/**
 * Polar Webhook Handler
 * 
 * Uses the official @polar-sh/supabase SDK for webhook processing.
 * Handles subscription lifecycle events and updates Supabase database.
 * 
 * @see https://polar.sh/docs/api-sdks/supabase
 */

import { Webhooks } from "npm:@polar-sh/supabase";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Initialize Supabase client with service role for admin operations
const getSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseServiceKey);
};

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

export const POST = Webhooks({
  webhookSecret: Deno.env.get("POLAR_WEBHOOK_SECRET")!,

  /**
   * Handle subscription created event
   */
  onSubscriptionCreated: async (payload) => {
    console.log("[polar-webhook] Subscription created:", payload.data.id);
    
    const supabase = getSupabaseAdmin();
    const subscription = payload.data;
    const customer = subscription.customer;
    
    const userId = await findUserId(
      supabase,
      customer?.id || null,
      customer?.email || null,
      subscription.metadata as Record<string, string> || null
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

    // Create/update subscription record
    const { error } = await supabase
      .from("subscriptions")
      .upsert({
        user_id: userId,
        polar_subscription_id: subscription.id,
        polar_customer_id: customer?.id,
        status: subscription.status || "active",
        plan_name: subscription.product?.name || "Legal Memo Pro",
        monthly_minutes_included: 999999, // Unlimited
        overage_rate_cents: 0,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        store: "polar",
        environment: "production",
      }, { onConflict: "user_id" });

    if (error) {
      console.error("[polar-webhook] Error creating subscription:", error);
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
  },

  /**
   * Handle subscription active event (renewal/reactivation)
   */
  onSubscriptionActive: async (payload) => {
    console.log("[polar-webhook] Subscription active:", payload.data.id);
    
    const supabase = getSupabaseAdmin();
    const subscription = payload.data;

    // Get existing subscription to find user
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("polar_subscription_id", subscription.id)
      .single();

    const { error } = await supabase
      .from("subscriptions")
      .update({
        status: "active",
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        canceled_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("polar_subscription_id", subscription.id);

    if (error) {
      console.error("[polar-webhook] Error activating subscription:", error);
      return;
    }

    // Reset usage for new billing period on renewal
    if (existingSub?.user_id && subscription.current_period_start && subscription.current_period_end) {
      await supabase.rpc("reset_usage_period", {
        p_user_id: existingSub.user_id,
        p_period_start: subscription.current_period_start,
        p_period_end: subscription.current_period_end,
      });
      console.log("[polar-webhook] Reset usage period for user:", existingSub.user_id);
    }

    console.log("[polar-webhook] Subscription activated:", subscription.id);
  },

  /**
   * Handle subscription updated event
   */
  onSubscriptionUpdated: async (payload) => {
    console.log("[polar-webhook] Subscription updated:", payload.data.id);
    
    const supabase = getSupabaseAdmin();
    const subscription = payload.data;

    const { error } = await supabase
      .from("subscriptions")
      .update({
        status: subscription.status || "active",
        plan_name: subscription.product?.name,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        updated_at: new Date().toISOString(),
      })
      .eq("polar_subscription_id", subscription.id);

    if (error) {
      console.error("[polar-webhook] Error updating subscription:", error);
    }

    console.log("[polar-webhook] Subscription updated:", subscription.id);
  },

  /**
   * Handle subscription canceled event
   */
  onSubscriptionCanceled: async (payload) => {
    console.log("[polar-webhook] Subscription canceled:", payload.data.id);
    
    const supabase = getSupabaseAdmin();
    const subscription = payload.data;

    const { error } = await supabase
      .from("subscriptions")
      .update({
        status: "canceled",
        canceled_at: subscription.canceled_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("polar_subscription_id", subscription.id);

    if (error) {
      console.error("[polar-webhook] Error canceling subscription:", error);
    }

    console.log("[polar-webhook] Subscription canceled:", subscription.id);
  },

  /**
   * Handle subscription revoked event (immediate termination)
   */
  onSubscriptionRevoked: async (payload) => {
    console.log("[polar-webhook] Subscription revoked:", payload.data.id);
    
    const supabase = getSupabaseAdmin();
    const subscription = payload.data;

    const { error } = await supabase
      .from("subscriptions")
      .update({
        status: "expired",
        updated_at: new Date().toISOString(),
      })
      .eq("polar_subscription_id", subscription.id);

    if (error) {
      console.error("[polar-webhook] Error revoking subscription:", error);
    }

    console.log("[polar-webhook] Subscription revoked:", subscription.id);
  },

  /**
   * Handle subscription uncanceled event (user reactivated before period end)
   */
  onSubscriptionUncanceled: async (payload) => {
    console.log("[polar-webhook] Subscription uncanceled:", payload.data.id);
    
    const supabase = getSupabaseAdmin();
    const subscription = payload.data;

    const { error } = await supabase
      .from("subscriptions")
      .update({
        status: "active",
        canceled_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("polar_subscription_id", subscription.id);

    if (error) {
      console.error("[polar-webhook] Error uncanceling subscription:", error);
    }

    console.log("[polar-webhook] Subscription uncanceled:", subscription.id);
  },

  /**
   * Handle customer created event
   */
  onCustomerCreated: async (payload) => {
    console.log("[polar-webhook] Customer created:", payload.data.id);
    
    const supabase = getSupabaseAdmin();
    const customer = payload.data;

    // Link customer to user profile if we have email match
    if (customer.email) {
      const { error } = await supabase
        .from("profiles")
        .update({ polar_customer_id: customer.id })
        .eq("email", customer.email)
        .is("polar_customer_id", null);

      if (!error) {
        console.log("[polar-webhook] Linked customer to profile:", customer.email);
      }
    }
  },

  /**
   * Handle order paid event (for one-time purchases or subscription start)
   */
  onOrderPaid: async (payload) => {
    console.log("[polar-webhook] Order paid:", payload.data.id);
    // Order paid events are handled by subscription events for subscriptions
    // This is primarily for one-time purchases which we don't use currently
  },
});

