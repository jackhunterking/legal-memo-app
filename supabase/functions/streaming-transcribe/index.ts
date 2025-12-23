/**
 * Supabase Edge Function: streaming-transcribe
 * 
 * Handles real-time streaming transcription with AssemblyAI.
 * Manages WebSocket connections and audio format conversion.
 * 
 * Actions (passed in request body):
 * - start-session: Initialize streaming session for a meeting
 * - process-chunk: Send audio chunk and receive transcripts
 * - end-session: Terminate streaming session
 * 
 * AssemblyAI Streaming API v3 Requirements:
 * - WebSocket: wss://streaming.assemblyai.com/v3/ws?sample_rate=16000
 * - Audio: PCM16 (16-bit signed integer), 16kHz, mono
 * - Messages: SessionBegins, PartialTranscript, FinalTranscript, SessionTerminated
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// AssemblyAI Streaming API v3 configuration
const ASSEMBLYAI_STREAMING_URL = "wss://streaming.assemblyai.com/v3/ws";
const ASSEMBLYAI_SAMPLE_RATE = 16000;

// CloudConvert API for audio format conversion
const CLOUDCONVERT_API_URL = "https://api.cloudconvert.com/v2";

// Types for AssemblyAI messages
interface AssemblyAISessionBegins {
  message_type: "SessionBegins";
  session_id: string;
  expires_at: string;
}

interface AssemblyAITranscript {
  message_type: "PartialTranscript" | "FinalTranscript";
  audio_start: number;
  audio_end: number;
  confidence: number;
  text: string;
  words?: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
    speaker?: string;
  }>;
}

interface AssemblyAISessionTerminated {
  message_type: "SessionTerminated";
}

interface AssemblyAIError {
  error: string;
}

type AssemblyAIMessage = 
  | AssemblyAISessionBegins 
  | AssemblyAITranscript 
  | AssemblyAISessionTerminated 
  | AssemblyAIError;

// Request types with action field
interface BaseRequest {
  action: "start-session" | "process-chunk" | "end-session";
}

interface StartSessionRequest extends BaseRequest {
  action: "start-session";
  meeting_id: string;
}

interface ProcessChunkRequest extends BaseRequest {
  action: "process-chunk";
  meeting_id: string;
  audio_base64: string;
  chunk_index: number;
  format?: string; // 'm4a', 'wav', etc.
}

interface EndSessionRequest extends BaseRequest {
  action: "end-session";
  meeting_id: string;
  session_id?: string;
}

type RequestBody = StartSessionRequest | ProcessChunkRequest | EndSessionRequest;

// Response types
interface StartSessionResponse {
  session_id: string;
  expires_at: string;
  meeting_id: string;
}

interface ProcessChunkResponse {
  partial_text: string;
  final_segments: Array<{
    text: string;
    speaker: string;
    start_ms: number;
    end_ms: number;
    confidence: number;
  }>;
  chunk_index: number;
}

/**
 * Convert audio from M4A/AAC to PCM16 @ 16kHz using CloudConvert
 * Returns base64 encoded PCM audio
 */
async function convertAudioToPCM16(
  audioBase64: string,
  inputFormat: string,
  cloudConvertApiKey: string
): Promise<string> {
  console.log(`[streaming-transcribe] Converting ${inputFormat} to PCM16...`);

  // Decode base64 to binary
  const binaryString = atob(audioBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Create CloudConvert job for audio conversion
  const createJobResponse = await fetch(`${CLOUDCONVERT_API_URL}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cloudConvertApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tasks: {
        "import-audio": {
          operation: "import/upload",
        },
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
  console.log(`[streaming-transcribe] CloudConvert job created: ${jobId}`);

  // Get upload task
  const uploadTask = jobData.data.tasks.find(
    (t: { name: string }) => t.name === "import-audio"
  );
  if (!uploadTask) {
    throw new Error("Upload task not found in CloudConvert job");
  }

  // Wait for upload task to be ready
  let taskReady = false;
  let uploadUrl = "";
  let uploadParams: Record<string, string> = {};

  for (let i = 0; i < 10; i++) {
    const taskResponse = await fetch(
      `${CLOUDCONVERT_API_URL}/tasks/${uploadTask.id}`,
      {
        headers: { Authorization: `Bearer ${cloudConvertApiKey}` },
      }
    );
    const taskData = await taskResponse.json();

    if (taskData.data.result?.form) {
      uploadUrl = taskData.data.result.form.url;
      uploadParams = taskData.data.result.form.parameters;
      taskReady = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!taskReady) {
    throw new Error("CloudConvert upload task not ready");
  }

  // Upload the audio file
  const formData = new FormData();
  for (const [key, value] of Object.entries(uploadParams)) {
    formData.append(key, value);
  }
  const audioBlob = new Blob([bytes], { type: `audio/${inputFormat}` });
  formData.append("file", audioBlob, `audio.${inputFormat}`);

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload file to CloudConvert");
  }

  // Poll for job completion
  let completedJob = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const statusResponse = await fetch(
      `${CLOUDCONVERT_API_URL}/jobs/${jobId}`,
      {
        headers: { Authorization: `Bearer ${cloudConvertApiKey}` },
      }
    );
    const statusData = await statusResponse.json();

    if (statusData.data.status === "finished") {
      completedJob = statusData.data;
      break;
    } else if (statusData.data.status === "error") {
      throw new Error("CloudConvert conversion failed");
    }
  }

  if (!completedJob) {
    throw new Error("CloudConvert conversion timed out");
  }

  // Download converted file
  const exportTask = completedJob.tasks.find(
    (t: { name: string }) => t.name === "export-audio"
  );
  const exportedFileUrl = exportTask?.result?.files?.[0]?.url;

  if (!exportedFileUrl) {
    throw new Error("No exported file URL from CloudConvert");
  }

  const wavResponse = await fetch(exportedFileUrl);
  if (!wavResponse.ok) {
    throw new Error("Failed to download converted file");
  }

  const wavBuffer = await wavResponse.arrayBuffer();
  
  // Skip WAV header (44 bytes) to get raw PCM data
  const pcmData = new Uint8Array(wavBuffer.slice(44));
  
  // Convert to base64
  let binary = "";
  for (let i = 0; i < pcmData.length; i++) {
    binary += String.fromCharCode(pcmData[i]);
  }
  
  console.log(`[streaming-transcribe] Converted to PCM16, size: ${pcmData.length} bytes`);
  return btoa(binary);
}

/**
 * Process audio chunk through AssemblyAI streaming
 * Opens WebSocket, sends audio, collects transcripts, closes connection
 */
async function processAudioWithAssemblyAI(
  pcmBase64: string,
  assemblyAIKey: string
): Promise<{ partial: string; finals: AssemblyAITranscript[] }> {
  return new Promise((resolve, reject) => {
    const wsUrl = `${ASSEMBLYAI_STREAMING_URL}?sample_rate=${ASSEMBLYAI_SAMPLE_RATE}`;
    console.log(`[streaming-transcribe] Connecting to AssemblyAI: ${wsUrl}`);

    const ws = new WebSocket(wsUrl);
    const finals: AssemblyAITranscript[] = [];
    let partial = "";
    let sessionStarted = false;
    let audioSent = false;

    const timeout = setTimeout(() => {
      ws.close();
      resolve({ partial, finals });
    }, 10000); // 10 second timeout

    ws.onopen = () => {
      console.log("[streaming-transcribe] WebSocket opened, authenticating...");
      ws.send(JSON.stringify({ token: assemblyAIKey }));
    };

    ws.onmessage = (event) => {
      try {
        const message: AssemblyAIMessage = JSON.parse(event.data);

        if ("error" in message) {
          console.error("[streaming-transcribe] AssemblyAI error:", message.error);
          clearTimeout(timeout);
          ws.close();
          reject(new Error(message.error));
          return;
        }

        switch (message.message_type) {
          case "SessionBegins":
            console.log(`[streaming-transcribe] Session started: ${message.session_id}`);
            sessionStarted = true;
            // Send audio data
            if (!audioSent) {
              ws.send(JSON.stringify({ audio_data: pcmBase64 }));
              audioSent = true;
              // Send end of audio signal after a short delay
              setTimeout(() => {
                ws.send(JSON.stringify({ terminate_session: true }));
              }, 500);
            }
            break;

          case "PartialTranscript":
            if (message.text) {
              partial = message.text;
            }
            break;

          case "FinalTranscript":
            if (message.text) {
              console.log(`[streaming-transcribe] Final: ${message.text}`);
              finals.push(message);
            }
            break;

          case "SessionTerminated":
            console.log("[streaming-transcribe] Session terminated");
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
      console.log(`[streaming-transcribe] WebSocket closed: ${event.code}`);
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

  try {
    // Parse request body first to get the action
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate action is present
    if (!body.action) {
      return new Response(
        JSON.stringify({ error: "Missing 'action' in request body. Valid actions: start-session, process-chunk, end-session" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[streaming-transcribe] Action: ${body.action}`);

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get API keys
    const assemblyAIKey = Deno.env.get("ASSEMBLYAI_API_KEY");
    const cloudConvertApiKey = Deno.env.get("CLOUDCONVERT_API_KEY");

    if (!assemblyAIKey) {
      return new Response(
        JSON.stringify({ error: "ASSEMBLYAI_API_KEY not configured on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Route to appropriate handler based on action
    switch (body.action) {
      case "start-session": {
        const { meeting_id } = body as StartSessionRequest;
        
        if (!meeting_id) {
          return new Response(
            JSON.stringify({ error: "Missing meeting_id" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create streaming session record
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

        const { error: insertError } = await supabase
          .from("streaming_sessions")
          .insert({
            id: sessionId,
            meeting_id: meeting_id,
            assemblyai_session_id: sessionId,
            expires_at: expiresAt,
            status: "active",
          });

        if (insertError) {
          console.error("[streaming-transcribe] Error creating session:", insertError);
          // Don't fail - session record is optional
        }

        const response: StartSessionResponse = {
          session_id: sessionId,
          expires_at: expiresAt,
          meeting_id: meeting_id,
        };

        console.log(`[streaming-transcribe] Session started for meeting: ${meeting_id}`);
        
        return new Response(
          JSON.stringify(response),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "process-chunk": {
        const { meeting_id, audio_base64, chunk_index, format } = body as ProcessChunkRequest;

        if (!meeting_id || !audio_base64) {
          return new Response(
            JSON.stringify({ error: "Missing meeting_id or audio_base64" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[streaming-transcribe] Processing chunk ${chunk_index} for meeting ${meeting_id}`);

        // Convert audio to PCM16 if needed
        let pcmBase64 = audio_base64;
        const inputFormat = format || "m4a";

        if (inputFormat !== "pcm" && inputFormat !== "wav" && cloudConvertApiKey) {
          pcmBase64 = await convertAudioToPCM16(audio_base64, inputFormat, cloudConvertApiKey);
        }

        // Process through AssemblyAI
        const { partial, finals } = await processAudioWithAssemblyAI(pcmBase64, assemblyAIKey);

        // Save final segments to database
        const finalSegments: ProcessChunkResponse["final_segments"] = [];
        
        for (const final of finals) {
          // Determine speaker from words or use default
          let speaker = "Speaker A";
          if (final.words && final.words.length > 0) {
            const speakerWord = final.words.find(w => w.speaker);
            if (speakerWord?.speaker) {
              speaker = speakerWord.speaker;
            }
          }

          const segment = {
            text: final.text,
            speaker,
            start_ms: final.audio_start,
            end_ms: final.audio_end,
            confidence: final.confidence,
          };
          finalSegments.push(segment);

          // Insert into transcript_segments
          const { error: segmentError } = await supabase
            .from("transcript_segments")
            .insert({
              meeting_id: meeting_id,
              speaker: segment.speaker,
              text: segment.text,
              start_ms: segment.start_ms,
              end_ms: segment.end_ms,
              confidence: segment.confidence,
              is_streaming_result: true,
            });

          if (segmentError) {
            console.error("[streaming-transcribe] Error saving segment:", segmentError);
          }
        }

        // Update session chunk count (non-blocking)
        supabase
          .from("streaming_sessions")
          .update({ 
            chunks_processed: chunk_index + 1,
            last_activity_at: new Date().toISOString(),
          })
          .eq("meeting_id", meeting_id)
          .eq("status", "active")
          .then(() => {});

        const response: ProcessChunkResponse = {
          partial_text: partial,
          final_segments: finalSegments,
          chunk_index: chunk_index,
        };

        console.log(`[streaming-transcribe] Chunk ${chunk_index} processed, ${finalSegments.length} segments`);

        return new Response(
          JSON.stringify(response),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "end-session": {
        const { meeting_id } = body as EndSessionRequest;

        if (!meeting_id) {
          return new Response(
            JSON.stringify({ error: "Missing meeting_id" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update session status
        const { error: updateError } = await supabase
          .from("streaming_sessions")
          .update({
            status: "completed",
            ended_at: new Date().toISOString(),
          })
          .eq("meeting_id", meeting_id)
          .eq("status", "active");

        if (updateError) {
          console.error("[streaming-transcribe] Error ending session:", updateError);
        }

        // Mark meeting as having used streaming transcription
        await supabase
          .from("meetings")
          .update({ used_streaming_transcription: true })
          .eq("id", meeting_id);

        console.log(`[streaming-transcribe] Session ended for meeting: ${meeting_id}`);

        return new Response(
          JSON.stringify({ success: true, meeting_id: meeting_id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${(body as any).action}. Valid actions: start-session, process-chunk, end-session` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("[streaming-transcribe] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
