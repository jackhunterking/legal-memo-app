/**
 * Supabase Edge Function: get-assemblyai-token
 * 
 * Provides AssemblyAI API key to authenticated clients for v3 Streaming API.
 * 
 * AssemblyAI v3 Streaming API:
 * - WebSocket URL: wss://streaming.assemblyai.com/v3/ws
 * - Auth: Pass token via query param or Authorization header
 * - No separate token endpoint needed - API key works directly
 * 
 * Features:
 * - Requires valid Authorization header (user must be logged in)
 * - Per-user rate limiting (60 requests/minute)
 * - Returns API key for WebSocket connection
 */

const LOG_PREFIX = '[get-assemblyai-token]';

console.log(`${LOG_PREFIX} ========================================`);
console.log(`${LOG_PREFIX} Edge Function LOADED (v3 API)`);
console.log(`${LOG_PREFIX} Timestamp: ${new Date().toISOString()}`);
console.log(`${LOG_PREFIX} ========================================`);

// Rate limiting configuration
type RateBucket = { count: number; resetAt: number };
const RATE_LIMIT_PER_MIN = 60;
const buckets = new Map<string, RateBucket>();

// Token validity duration in seconds (1 hour)
const TOKEN_EXPIRES_IN = 3600;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Check if ASSEMBLYAI_API_KEY is configured at startup
const assemblyApiKeyConfigured = !!Deno.env.get('ASSEMBLYAI_API_KEY');
console.log(`${LOG_PREFIX} ASSEMBLYAI_API_KEY configured: ${assemblyApiKeyConfigured}`);
if (assemblyApiKeyConfigured) {
  const keyLength = Deno.env.get('ASSEMBLYAI_API_KEY')?.length ?? 0;
  console.log(`${LOG_PREFIX} ASSEMBLYAI_API_KEY length: ${keyLength}`);
}

/**
 * Extract user ID from request.
 * Prefers x-supabase-auth-user-id header (set by Supabase automatically).
 * Falls back to minimal JWT decode if header is missing.
 */
function getUserIdFromRequest(req: Request): { userId: string | null; source: string; debugInfo: object } {
  console.log(`${LOG_PREFIX} Extracting user ID from request...`);
  
  // Log all headers for debugging (mask sensitive values)
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'authorization') {
      headers[key] = value ? `Bearer ***${value.length > 20 ? value.substring(value.length - 10) : '(short)'}` : '(empty)';
    } else if (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
      headers[key] = value ? `***${value.length}chars` : '(empty)';
    } else {
      headers[key] = value;
    }
  });
  console.log(`${LOG_PREFIX} Request headers:`, JSON.stringify(headers, null, 2));

  // Prefer the platform-provided header
  const userIdHeader = req.headers.get('x-supabase-auth-user-id');
  if (userIdHeader) {
    console.log(`${LOG_PREFIX} User ID found in x-supabase-auth-user-id header: ${userIdHeader}`);
    return { userId: userIdHeader, source: 'x-supabase-auth-user-id header', debugInfo: { headerValue: userIdHeader } };
  }
  console.log(`${LOG_PREFIX} No x-supabase-auth-user-id header found`);

  // Fallback: minimally decode JWT to get "sub" if header missing
  const auth = req.headers.get('Authorization') ?? '';
  console.log(`${LOG_PREFIX} Authorization header present: ${!!auth}`);
  console.log(`${LOG_PREFIX} Authorization header length: ${auth.length}`);
  
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    console.log(`${LOG_PREFIX} Authorization header does not match Bearer pattern`);
    return { userId: null, source: 'no valid Bearer token', debugInfo: { authLength: auth.length } };
  }

  console.log(`${LOG_PREFIX} Bearer token found, attempting to decode JWT...`);
  
  try {
    const jwt = m[1];
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      console.log(`${LOG_PREFIX} Invalid JWT format - expected 3 parts, got ${parts.length}`);
      return { userId: null, source: 'invalid JWT format', debugInfo: { jwtParts: parts.length } };
    }
    
    const payloadB64 = parts[1];
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    
    console.log(`${LOG_PREFIX} JWT payload parsed:`, JSON.stringify({
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      exp: payload.exp,
      isExpired: payload.exp ? Date.now() > payload.exp * 1000 : 'N/A',
    }, null, 2));
    
    if (typeof payload.sub === 'string') {
      console.log(`${LOG_PREFIX} User ID extracted from JWT sub: ${payload.sub}`);
      return { userId: payload.sub, source: 'JWT sub claim', debugInfo: { email: payload.email, role: payload.role } };
    }
    
    return { userId: null, source: 'JWT sub not a string', debugInfo: { subType: typeof payload.sub } };
  } catch (err) {
    console.error(`${LOG_PREFIX} JWT decode error:`, err);
    return { userId: null, source: 'JWT decode error', debugInfo: { error: String(err) } };
  }
}

/**
 * Check if user is within rate limit.
 */
function checkRateLimit(userId: string): { allowed: boolean; debugInfo: object } {
  const now = Date.now();
  const bucket = buckets.get(userId);
  
  console.log(`${LOG_PREFIX} Checking rate limit for user: ${userId}`);
  
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(userId, { count: 1, resetAt: now + 60_000 });
    return { allowed: true, debugInfo: { reason: 'new_bucket', count: 1 } };
  }
  
  if (bucket.count < RATE_LIMIT_PER_MIN) {
    bucket.count += 1;
    return { allowed: true, debugInfo: { reason: 'under_limit', count: bucket.count } };
  }
  
  console.log(`${LOG_PREFIX} Rate limit: EXCEEDED - count ${bucket.count}`);
  return { allowed: false, debugInfo: { reason: 'exceeded', count: bucket.count } };
}

console.info(`${LOG_PREFIX} Deno.serve starting...`);

Deno.serve(async (req: Request) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  
  console.log(`${LOG_PREFIX} ========================================`);
  console.log(`${LOG_PREFIX} [${requestId}] INCOMING REQUEST`);
  console.log(`${LOG_PREFIX} [${requestId}] Method: ${req.method}`);
  console.log(`${LOG_PREFIX} ========================================`);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Step 1: Check HTTP method
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ 
        error: 'method_not_allowed',
        request_id: requestId,
      }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Extract and validate user ID
    const { userId, source, debugInfo } = getUserIdFromRequest(req);
    
    if (!userId) {
      console.error(`${LOG_PREFIX} [${requestId}] REJECTED: No user ID found`);
      return new Response(JSON.stringify({ 
        error: 'unauthorized',
        message: 'No valid authentication found',
        debug: { source, ...debugInfo },
        request_id: requestId,
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`${LOG_PREFIX} [${requestId}] User authenticated: ${userId}`);

    // Step 3: Check rate limit
    const rateLimitResult = checkRateLimit(userId);
    if (!rateLimitResult.allowed) {
      return new Response(JSON.stringify({ 
        error: 'rate_limited',
        request_id: requestId,
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 4: Get ASSEMBLYAI_API_KEY
    const assemblyApiKey = Deno.env.get('ASSEMBLYAI_API_KEY');
    
    if (!assemblyApiKey) {
      console.error(`${LOG_PREFIX} [${requestId}] REJECTED: ASSEMBLYAI_API_KEY not configured`);
      return new Response(JSON.stringify({ 
        error: 'server_misconfigured',
        message: 'AssemblyAI API key not configured on server',
        request_id: requestId,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 5: Return API key for v3 Streaming API
    // In v3, the API key can be used directly in the token query parameter
    // or Authorization header when connecting to WebSocket
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRES_IN * 1000).toISOString();
    const elapsed = Date.now() - startTime;
    
    console.log(`${LOG_PREFIX} [${requestId}] SUCCESS - Returning token in ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        // Return the API key as the token for v3 streaming
        token: assemblyApiKey,
        expires_at: expiresAt,
        // v3 Streaming API configuration
        websocket_url: 'wss://streaming.assemblyai.com/v3/ws',
        sample_rate: 16000,
        encoding: 'pcm_s16le',
        // User info for tracking
        user_id: userId,
        request_id: requestId,
        processing_time_ms: elapsed,
        // v3 API info
        api_version: 'v3',
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (e) {
    const elapsed = Date.now() - startTime;
    console.error(`${LOG_PREFIX} [${requestId}] UNEXPECTED ERROR:`, e);
    
    return new Response(JSON.stringify({ 
      error: 'internal_error',
      message: e instanceof Error ? e.message : 'Unknown error',
      request_id: requestId,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
