/**
 * Polar Checkout Handler - Direct API Version
 * 
 * Creates a Polar checkout session and redirects to hosted checkout.
 * Uses direct API calls with explicit timeout for reliability.
 * 
 * Supports both production and sandbox environments via POLAR_MODE env var.
 * 
 * Query Parameters:
 * - products: Product/Price ID (required)
 * - customerEmail: Customer email (optional)
 * - customerExternalId: External user ID for linking (optional)
 * - metadata: URL-encoded JSON string (optional)
 * 
 * Environment Variables:
 * - POLAR_MODE: "production" (default) or "sandbox"
 * - POLAR_ACCESS_TOKEN: Production API token
 * - POLAR_SANDBOX_ACCESS_TOKEN: Sandbox API token (required if POLAR_MODE=sandbox)
 */

// API URLs for production and sandbox
const POLAR_PRODUCTION_API_URL = "https://api.polar.sh/v1";
const POLAR_SANDBOX_API_URL = "https://sandbox-api.polar.sh/v1";

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
  
  console.log("[polar-checkout] Request received:", req.method, req.url);
  console.log("[polar-checkout] Mode:", mode);
  console.log("[polar-checkout] API URL:", apiUrl);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    console.log("[polar-checkout] Token exists:", !!accessToken);
    console.log("[polar-checkout] Token length:", accessToken?.length || 0);
    
    if (!accessToken) {
      const tokenName = mode === "sandbox" ? "POLAR_SANDBOX_ACCESS_TOKEN" : "POLAR_ACCESS_TOKEN";
      console.error(`[polar-checkout] ${tokenName} not set`);
      return new Response(`Configuration error: Missing ${tokenName}`, { status: 500 });
    }

    const url = new URL(req.url);
    const productId = url.searchParams.get("products");
    const customerEmail = url.searchParams.get("customerEmail");
    const customerExternalId = url.searchParams.get("customerExternalId");
    const metadataStr = url.searchParams.get("metadata");

    console.log("[polar-checkout] Product ID:", productId);

    if (!productId) {
      return new Response("Product ID required", { status: 400 });
    }

    // Build checkout request body
    const checkoutBody: Record<string, unknown> = {
      products: [productId],
      success_url: "https://use.legalmemo.app/checkout/success",
    };

    if (customerEmail) {
      checkoutBody.customer_email = customerEmail;
    }

    if (customerExternalId) {
      checkoutBody.customer_external_id = customerExternalId;
    }

    if (metadataStr) {
      try {
        checkoutBody.metadata = JSON.parse(metadataStr);
      } catch {
        console.warn("[polar-checkout] Failed to parse metadata");
      }
    }

    console.log("[polar-checkout] Request body:", JSON.stringify(checkoutBody));
    console.log("[polar-checkout] Calling Polar API with timeout...");

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`${apiUrl}/checkouts/`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(checkoutBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log("[polar-checkout] Polar response status:", response.status);
      const responseText = await response.text();
      console.log("[polar-checkout] Polar response:", responseText.substring(0, 500));
      
      if (!response.ok) {
        return new Response(`Checkout failed: ${responseText}`, { 
          status: response.status,
          headers: { "Content-Type": "text/plain" }
        });
      }

      const checkout = JSON.parse(responseText);
      console.log("[polar-checkout] Success! Redirecting to:", checkout.url);

      return new Response(null, {
        status: 302,
        headers: {
          "Location": checkout.url,
        },
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        console.error("[polar-checkout] Fetch timeout after", FETCH_TIMEOUT_MS, "ms");
        return new Response("Polar API timeout - please try again", { status: 504 });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error("[polar-checkout] Error:", error);
    return new Response(`Error: ${error instanceof Error ? error.message : "Unknown"}`, { 
      status: 500 
    });
  }
});
