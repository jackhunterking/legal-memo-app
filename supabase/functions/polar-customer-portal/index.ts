/**
 * Polar Customer Portal Handler
 * 
 * Uses the official @polar-sh/supabase SDK for customer portal access.
 * Redirects users to their Polar subscription management portal.
 * 
 * Supports both production and sandbox environments via POLAR_MODE env var.
 * 
 * Query Parameters:
 * - customerId: Polar customer ID (required for browser redirects)
 * 
 * Environment Variables:
 * - POLAR_MODE: "production" (default) or "sandbox"
 * - POLAR_ACCESS_TOKEN: Production API token
 * - POLAR_SANDBOX_ACCESS_TOKEN: Sandbox API token (required if POLAR_MODE=sandbox)
 * 
 * @see https://polar.sh/docs/api-sdks/supabase
 */

import { CustomerPortal } from "npm:@polar-sh/supabase";

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

export const GET = CustomerPortal({
  accessToken: config.accessToken,
  returnUrl: "https://use.legalmemo.app",
  server: config.server,
  
  /**
   * Resolve Polar customer ID from the request query params
   * For browser redirects, the customerId must be passed as a query parameter
   */
  getCustomerId: async (req: Request) => {
    const url = new URL(req.url);
    const customerId = url.searchParams.get("customerId");
    
    console.log("[polar-customer-portal] Request for customer:", customerId);
    console.log("[polar-customer-portal] Server mode:", config.server);
    
    if (!customerId) {
      throw new Error("Customer ID is required. Please provide customerId query parameter.");
    }

    return customerId;
  },
});
