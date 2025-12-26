/**
 * Polar Checkout Handler
 * 
 * Uses the official @polar-sh/supabase SDK for checkout flow.
 * Redirects users to Polar's hosted checkout page.
 * 
 * Query Parameters:
 * - products: Product/Price ID (required)
 * - customerEmail: Customer email (optional)
 * - customerExternalId: External user ID for linking (optional)
 * - metadata: URL-encoded JSON string (optional)
 * 
 * @see https://polar.sh/docs/api-sdks/supabase
 */

import { Checkout } from "npm:@polar-sh/supabase";

export const GET = Checkout({
  accessToken: Deno.env.get("POLAR_ACCESS_TOKEN")!,
  successUrl: "https://use.legalmemo.app/checkout/success",
  returnUrl: "https://use.legalmemo.app",
  server: "production",
  theme: "dark",
});

