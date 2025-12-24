/**
 * Supabase Edge Function: streaming-transcribe
 * 
 * Handles real-time streaming transcription with AssemblyAI v3 API.
 * 
 * Actions (passed in request body):
 * - start-session: Initialize streaming session for a meeting
 * - process-chunk: Send audio chunk and receive transcripts
 * - end-session: Terminate streaming session
 * 
 * AssemblyAI v3 Streaming API:
 * - WebSocket URL: wss://streaming.assemblyai.com/v3/ws
 * - Auth: token query parameter
 * - Audio: Raw binary PCM chunks
 * - Messages: Begin, Turn, Termination
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// AssemblyAI v3 Streaming API configuration
const ASSEMBLYAI_STREAMING_URL = "wss://streaming.assemblyai.com/v3/ws";
const ASSEMBLYAI_SAMPLE_RATE = 16000;

// CloudConvert API for audio format conversion
const CLOUDCONVERT_API_URL = "https://api.cloudconvert.com/v2";

// Helper to create JSON response
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Helper to create error response
function errorResponse(message: string, status = 400) {
  console.error(`[streaming-transcribe] Error (${status}): ${message}`);
  return jsonResponse({ error: message }, status);
}

// Types for AssemblyAI v3 messages
interface AssemblyAIV3Begin {
  type: "Begin";
  id: string;
  expires_at: string;
}

interface AssemblyAIV3Word {
  text: string;
  start: number;
  end: number;
  confidence: number;
  word_is_final: boolean;
}

interface AssemblyAIV3Turn {
  type: "Turn";
  turn_order: number;
  turn_is_formatted: boolean;
  end_of_turn: boolean;
  transcript: string;
  utterance?: string;
  end_of_turn_confidence: number;
  words: AssemblyAIV3Word[];
}

interface AssemblyAIV3Termination {
  type: "Termination";
  audio_duration_seconds: number;
  session_duration_seconds: number;
}

interface AssemblyAIV3Error {
  error: string;
}

type AssemblyAIV3Message = 
  | AssemblyAIV3Begin 
  | AssemblyAIV3Turn 
  | AssemblyAIV3Termination 
  | AssemblyAIV3Error;

/**
 * Convert audio from M4A/AAC to PCM16 @ 16kHz using CloudConvert
 */
async function convertAudioToPCM16(
  audioBase64: string,
  inputFormat: string,
  cloudConvertApiKey: string
): Promise<string> {
  console.log(`[streaming-transcribe] Converting ${inputFormat} to PCM16...`);

  const binaryString = atob(audioBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const createJobResponse = await fetch(`${CLOUDCONVERT_API_URL}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cloudConvertApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tasks: {
        "import-audio": { operation: "import/upload" },
        "convert-audio": {
          operation: "convert",
          input: "import-audio",
          output_format: "wav",
          audio_codec: "pcm_s16le",
          audio_bitrate: 256,
          audio_frequency: ASSEMBLYAI_SAMPLE_RATE,
          audio_channels: 1,
        },
        "export-audio": {
          operation: "export/url",
          input: "convert-audio",
          inline: false,
          archive_multiple_files: false,
        },
      },
    }),
  });

  if (!createJobResponse.ok) {
    const errorText = await createJobResponse.text();
    throw new Error(`CloudConvert job creation failed: ${errorText}`);
  }

  const jobData = await createJobResponse.json();
  const jobId = jobData.data.id;

  const uploadTask = jobData.data.tasks.find((t: { name: string }) => t.name === "import-audio");
  if (!uploadTask) throw new Error("Upload task not found");

  let taskReady = false;
  let uploadUrl = "";
  let uploadParams: Record<string, string> = {};

  for (let i = 0; i < 10; i++) {
    const taskResponse = await fetch(`${CLOUDCONVERT_API_URL}/tasks/${uploadTask.id}`, {
      headers: { Authorization: `Bearer ${cloudConvertApiKey}` },
    });
    const taskData = await taskResponse.json();
    if (taskData.data.result?.form) {
      uploadUrl = taskData.data.result.form.url;
      uploadParams = taskData.data.result.form.parameters;
      taskReady = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!taskReady) throw new Error("CloudConvert upload task not ready");

  const formData = new FormData();
  for (const [key, value] of Object.entries(uploadParams)) {
    formData.append(key, value);
  }
  const audioBlob = new Blob([bytes], { type: `audio/${inputFormat}` });
  formData.append("file", audioBlob, `audio.${inputFormat}`);

  const uploadResponse = await fetch(uploadUrl, { method: "POST", body: formData });
  if (!uploadResponse.ok) throw new Error("Failed to upload to CloudConvert");

  let completedJob = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const statusResponse = await fetch(`${CLOUDCONVERT_API_URL}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${cloudConvertApiKey}` },
    });
    const statusData = await statusResponse.json();
    if (statusData.data.status === "finished") {
      completedJob = statusData.data;
      break;
    } else if (statusData.data.status === "error") {
      throw new Error("CloudConvert conversion failed");
    }
  }

  if (!completedJob) throw new Error("CloudConvert conversion timed out");

  const exportTask = completedJob.tasks.find((t: { name: string }) => t.name === "export-audio");
  const exportedFileUrl = exportTask?.result?.files?.[0]?.url;
  if (!exportedFileUrl) throw new Error("No exported file URL");

  const wavResponse = await fetch(exportedFileUrl);
  if (!wavResponse.ok) throw new Error("Failed to download converted file");

  const wavBuffer = await wavResponse.arrayBuffer();
  const pcmData = new Uint8Array(wavBuffer.slice(44));
  
  let binary = "";
  for (let i = 0; i < pcmData.length; i++) {
    binary += String.fromCharCode(pcmData[i]);
  }
  
  return btoa(binary);
}

/**
 * Convert base64 to Uint8Array for binary WebSocket sending
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Process audio chunk through AssemblyAI v3 streaming
 */
async function processAudioWithAssemblyAI(
  pcmBase64: string,
  assemblyAIKey: string
): Promise<{ partial: string; finals: AssemblyAIV3Turn[] }> {
  return new Promise((resolve, reject) => {
    // v3: Token in query parameter
    const wsUrl = `${ASSEMBLYAI_STREAMING_URL}?sample_rate=${ASSEMBLYAI_SAMPLE_RATE}&token=${encodeURIComponent(assemblyAIKey)}`;
    console.log(`[streaming-transcribe] Connecting to AssemblyAI v3...`);

    const ws = new WebSocket(wsUrl);
    const finals: AssemblyAIV3Turn[] = [];
    let partial = "";
    let audioSent = false;
    let sessionStarted = false;

    const timeout = setTimeout(() => {
      console.log("[streaming-transcribe] Timeout reached, closing...");
      ws.close();
      resolve({ partial, finals });
    }, 15000);

    ws.onopen = () => {
      console.log("[streaming-transcribe] WebSocket opened (v3 - no auth message needed)");
      // v3: No auth message needed - token is in URL
    };

    ws.onmessage = (event) => {
      try {
        const message: AssemblyAIV3Message = JSON.parse(event.data);

        if ("error" in message) {
          console.error("[streaming-transcribe] AssemblyAI error:", message.error);
          clearTimeout(timeout);
          ws.close();
          reject(new Error(message.error));
          return;
        }

        switch (message.type) {
          case "Begin":
            console.log(`[streaming-transcribe] Session started: ${message.id}`);
            sessionStarted = true;
            
            // Send audio after session starts
            if (!audioSent) {
              // v3: Send raw binary audio
              const audioBytes = base64ToUint8Array(pcmBase64);
              ws.send(audioBytes);
              audioSent = true;
              console.log(`[streaming-transcribe] Sent ${audioBytes.length} bytes of audio`);
              
              // Send terminate after a short delay
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "Terminate" }));
                  console.log("[streaming-transcribe] Sent Terminate");
                }
              }, 1000);
            }
            break;

          case "Turn":
            const turn = message as AssemblyAIV3Turn;
            if (turn.transcript) {
              if (turn.end_of_turn) {
                console.log(`[streaming-transcribe] Final turn: ${turn.transcript}`);
                finals.push(turn);
              } else {
                partial = turn.transcript;
              }
            }
            break;

          case "Termination":
            console.log("[streaming-transcribe] Session terminated:", {
              audio_duration: message.audio_duration_seconds,
              session_duration: message.session_duration_seconds,
            });
            clearTimeout(timeout);
            ws.close();
            resolve({ partial, finals });
            break;
        }
      } catch (err) {
        console.error("[streaming-transcribe] Error parsing message:", err);
      }
    };

    ws.onerror = (error) => {
      console.error("[streaming-transcribe] WebSocket error:", error);
      clearTimeout(timeout);
      reject(new Error("WebSocket connection error"));
    };

    ws.onclose = (event) => {
      console.log("[streaming-transcribe] WebSocket closed:", event.code);
      clearTimeout(timeout);
      resolve({ partial, finals });
    };
  });
}

/**
 * Main request handler
 */
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("[streaming-transcribe] === Request received (v3 API) ===");

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const assemblyAIKey = Deno.env.get("ASSEMBLYAI_API_KEY");
    const cloudConvertApiKey = Deno.env.get("CLOUDCONVERT_API_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse("Server configuration error: Missing Supabase URL or Anon Key", 500);
    }

    if (!assemblyAIKey) {
      return errorResponse("Server configuration error: ASSEMBLYAI_API_KEY not configured", 500);
    }

    // Get the auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse("Missing or invalid Authorization header", 401);
    }

    const jwt = authHeader.replace("Bearer ", "");

    // Create Supabase client for auth validation
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Validate user token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);

    if (userError || !user) {
      return errorResponse("Authentication failed", 401);
    }

    const userId = user.id;
    console.log("[streaming-transcribe] User authenticated:", userId);

    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON in request body", 400);
    }

    const action = body.action as string;
    if (!action) {
      return errorResponse("Missing 'action' field. Valid: start-session, process-chunk, end-session", 400);
    }

    console.log("[streaming-transcribe] Action:", action);

    // Handle actions
    switch (action) {
      case "start-session": {
        const meetingId = body.meeting_id as string;
        if (!meetingId) {
          return errorResponse("Missing meeting_id", 400);
        }

        // Verify the meeting belongs to the user
        const { data: meeting, error: meetingError } = await supabaseAdmin
          .from("meetings")
          .select("id, user_id")
          .eq("id", meetingId)
          .single();

        if (meetingError || !meeting) {
          return errorResponse("Meeting not found", 404);
        }

        if (meeting.user_id !== userId) {
          return errorResponse("You don't have permission to access this meeting", 403);
        }

        // Create session
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

        // Insert session record
        try {
          await supabaseAdmin
            .from("streaming_sessions")
            .insert({
              id: sessionId,
              meeting_id: meetingId,
              assemblyai_session_id: sessionId,
              expires_at: expiresAt,
              status: "active",
            });
        } catch (insertErr) {
          console.warn("[streaming-transcribe] Session record insert warning:", insertErr);
        }

        console.log("[streaming-transcribe] Session started:", sessionId);
        
        return jsonResponse({
          session_id: sessionId,
          expires_at: expiresAt,
          meeting_id: meetingId,
          api_version: "v3",
        });
      }

      case "process-chunk": {
        const meetingId = body.meeting_id as string;
        const audioBase64 = body.audio_base64 as string;
        const chunkIndex = (body.chunk_index as number) || 0;
        const format = (body.format as string) || "m4a";

        if (!meetingId || !audioBase64) {
          return errorResponse("Missing meeting_id or audio_base64", 400);
        }

        console.log(`[streaming-transcribe] Processing chunk ${chunkIndex} for ${meetingId}`);

        // Convert audio to PCM16 if needed
        let pcmBase64 = audioBase64;
        if (format !== "pcm" && format !== "wav" && cloudConvertApiKey) {
          try {
            pcmBase64 = await convertAudioToPCM16(audioBase64, format, cloudConvertApiKey);
          } catch (convError) {
            console.error("[streaming-transcribe] Audio conversion error:", convError);
            return errorResponse(`Audio conversion failed: ${convError instanceof Error ? convError.message : "Unknown error"}`, 500);
          }
        }

        // Process through AssemblyAI v3
        let partial = "";
        let finals: AssemblyAIV3Turn[] = [];
        
        try {
          const result = await processAudioWithAssemblyAI(pcmBase64, assemblyAIKey);
          partial = result.partial;
          finals = result.finals;
        } catch (aiError) {
          console.error("[streaming-transcribe] AssemblyAI error:", aiError);
        }

        // Save segments to database
        const finalSegments: Array<{
          text: string;
          speaker: string;
          start_ms: number;
          end_ms: number;
          confidence: number;
        }> = [];
        
        for (const turn of finals) {
          if (!turn.transcript) continue;
          
          const segment = {
            text: turn.transcript,
            speaker: "Speaker A", // v3 doesn't have speaker diarization in streaming
            start_ms: turn.words?.[0]?.start ?? 0,
            end_ms: turn.words?.[turn.words.length - 1]?.end ?? 0,
            confidence: turn.end_of_turn_confidence,
          };
          finalSegments.push(segment);

          // Insert segment
          supabaseAdmin
            .from("transcript_segments")
            .insert({
              meeting_id: meetingId,
              speaker: segment.speaker,
              text: segment.text,
              start_ms: segment.start_ms,
              end_ms: segment.end_ms,
              confidence: segment.confidence,
              is_streaming_result: true,
            })
            .then(() => {});
        }

        // Update session chunk count
        supabaseAdmin
          .from("streaming_sessions")
          .update({ 
            chunks_processed: chunkIndex + 1,
            last_activity_at: new Date().toISOString(),
          })
          .eq("meeting_id", meetingId)
          .eq("status", "active")
          .then(() => {});

        console.log(`[streaming-transcribe] Chunk ${chunkIndex} done, ${finalSegments.length} segments`);

        return jsonResponse({
          partial_text: partial,
          final_segments: finalSegments,
          chunk_index: chunkIndex,
        });
      }

      case "end-session": {
        const meetingId = body.meeting_id as string;
        if (!meetingId) {
          return errorResponse("Missing meeting_id", 400);
        }

        // Update session status
        await supabaseAdmin
          .from("streaming_sessions")
          .update({
            status: "completed",
            ended_at: new Date().toISOString(),
          })
          .eq("meeting_id", meetingId)
          .eq("status", "active");

        // Mark meeting as having used streaming
        await supabaseAdmin
          .from("meetings")
          .update({ used_streaming_transcription: true })
          .eq("id", meetingId);

        console.log(`[streaming-transcribe] Session ended for ${meetingId}`);

        return jsonResponse({ success: true, meeting_id: meetingId });
      }

      default:
        return errorResponse(`Unknown action: ${action}. Valid: start-session, process-chunk, end-session`, 400);
    }
  } catch (error) {
    console.error("[streaming-transcribe] Unexpected error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
});
