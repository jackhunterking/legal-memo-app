/**
 * Polar Customer Portal Handler
 * 
 * Uses the official @polar-sh/supabase SDK for customer portal access.
 * Redirects users to their Polar subscription management portal.
 * 
 * Query Parameters:
 * - customerId: Polar customer ID (required for browser redirects)
 * 
 * @see https://polar.sh/docs/api-sdks/supabase
 */

import { CustomerPortal } from "npm:@polar-sh/supabase";

export const GET = CustomerPortal({
  accessToken: Deno.env.get("POLAR_ACCESS_TOKEN")!,
  returnUrl: "https://use.legalmemo.app",
  server: "production",
  
  /**
   * Resolve Polar customer ID from the request query params
   * For browser redirects, the customerId must be passed as a query parameter
   */
  getCustomerId: async (req: Request) => {
    const url = new URL(req.url);
    const customerId = url.searchParams.get("customerId");
    
    if (!customerId) {
      throw new Error("Customer ID is required. Please provide customerId query parameter.");
    }

    return customerId;
  },
});

