// Supabase Edge Function: process-recording
// Unified pipeline: CloudConvert (audio conversion) + AssemblyAI (transcription with diarization)
// Uses SLAM-1 model for best English accuracy with built-in summarization
// Includes Polar usage metering for subscription billing

/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// API URLs
const CLOUDCONVERT_API_URL = "https://api.cloudconvert.com/v2";
const ASSEMBLYAI_API_URL = "https://api.assemblyai.com/v2";
const POLAR_API_URL = "https://api.polar.sh/v1";

// Types
interface ProcessRequest {
  meeting_id: string;
}

interface CloudConvertJob {
  id: string;
  status: string;
  tasks: Array<{
    id: string;
    name: string;
    status: string;
    result?: {
      files?: Array<{
        url: string;
        filename: string;
      }>;
      form?: {
        url: string;
        parameters: Record<string, string>;
      };
    };
  }>;
}

// AssemblyAI transcript response with summary field
interface AssemblyAITranscript {
  id: string;
  status: string;
  text?: string;
  summary?: string;  // From built-in summarization feature
  utterances?: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  error?: string;
}

// Transcription result with validation data
interface TranscriptionResult {
  transcript: AssemblyAITranscript;
  speechModel: string;
  language: string;
  detectedSpeakers: number;
  speakerMismatch: boolean;
}

// Helper: Update meeting status
async function updateMeetingStatus(
  supabase: ReturnType<typeof createClient>,
  meetingId: string,
  status: string,
  additionalData: Record<string, unknown> = {}
) {
  const { error } = await supabase
    .from("meetings")
    .update({ status, ...additionalData })
    .eq("id", meetingId);

  if (error) {
    console.error(`[ProcessRecording] Failed to update status to ${status}:`, error);
  }
}

// Helper: Update job status
async function updateJobStatus(
  supabase: ReturnType<typeof createClient>,
  meetingId: string,
  status: string,
  step: string | null,
  error: string | null = null
) {
  const updates: Record<string, unknown> = { status, step };
  if (error) updates.error = error;
  if (status === "processing" && !updates.started_at) {
    updates.started_at = new Date().toISOString();
  }
  if (status === "completed" || status === "failed") {
    updates.completed_at = new Date().toISOString();
  }

  await supabase
    .from("processing_jobs")
    .update(updates)
    .eq("meeting_id", meetingId);
}

// Step 1: Convert audio to MP3 using CloudConvert
async function convertToMp3(
  audioBlob: Blob,
  originalFormat: string,
  cloudConvertApiKey: string
): Promise<Blob> {
  console.log("[ProcessRecording] Starting CloudConvert conversion...");

  // Create job with import, convert, and export tasks
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
          output_format: "mp3",
          audio_codec: "mp3",
          audio_bitrate: 128,
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

  const jobData = await createJobResponse.json() as { data: CloudConvertJob };
  console.log(`[ProcessRecording] CloudConvert job created: ${jobData.data.id}`);

  // Get upload task
  const uploadTask = jobData.data.tasks.find((t) => t.name === "import-audio");
  if (!uploadTask) {
    throw new Error("Upload task not found in CloudConvert job");
  }

  // Get upload URL
  const getTaskResponse = await fetch(
    `${CLOUDCONVERT_API_URL}/tasks/${uploadTask.id}`,
    {
      headers: { Authorization: `Bearer ${cloudConvertApiKey}` },
    }
  );
  const taskData = await getTaskResponse.json() as { data: CloudConvertJob["tasks"][0] };

  if (!taskData.data.result?.form) {
    throw new Error("Upload form not ready");
  }

  // Upload the file
  console.log("[ProcessRecording] Uploading to CloudConvert...");
  const formData = new FormData();
  for (const [key, value] of Object.entries(taskData.data.result.form.parameters)) {
    formData.append(key, value);
  }
  formData.append("file", audioBlob, `audio.${originalFormat}`);

  const uploadResponse = await fetch(taskData.data.result.form.url, {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload file to CloudConvert");
  }

  console.log("[ProcessRecording] File uploaded, waiting for conversion...");

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max
  let completedJob: CloudConvertJob | null = null;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const statusResponse = await fetch(
      `${CLOUDCONVERT_API_URL}/jobs/${jobData.data.id}`,
      {
        headers: { Authorization: `Bearer ${cloudConvertApiKey}` },
      }
    );
    const statusData = await statusResponse.json() as { data: CloudConvertJob };

    if (statusData.data.status === "finished") {
      completedJob = statusData.data;
      break;
    } else if (statusData.data.status === "error") {
      throw new Error("CloudConvert conversion failed");
    }

    console.log(`[ProcessRecording] CloudConvert status: ${statusData.data.status}, attempt ${attempts + 1}`);
    attempts++;
  }

  if (!completedJob) {
    throw new Error("CloudConvert conversion timed out");
  }

  // Download converted file
  const exportTask = completedJob.tasks.find((t) => t.name === "export-audio");
  const exportedFileUrl = exportTask?.result?.files?.[0]?.url;

  if (!exportedFileUrl) {
    throw new Error("No exported file URL found from CloudConvert");
  }

  console.log("[ProcessRecording] Downloading converted MP3...");
  const mp3Response = await fetch(exportedFileUrl);
  if (!mp3Response.ok) {
    throw new Error("Failed to download converted file from CloudConvert");
  }

  return await mp3Response.blob();
}

// Step 2: Transcribe with AssemblyAI using SLAM-1 model
// Per AssemblyAI documentation:
// - SLAM-1: Best accuracy for English audio
// - 'best': Universal model for 99+ languages
// - speakers_expected: Exact count for best diarization accuracy
async function transcribeAudio(
  audioUrl: string,
  assemblyAIKey: string,
  expectedSpeakers: number = 2,
  language: string = "en"
): Promise<TranscriptionResult> {
  console.log("[ProcessRecording] Submitting to AssemblyAI for transcription...");
  console.log(`[ProcessRecording] Expected speakers: ${expectedSpeakers}, Language: ${language}`);

  // Determine speech model based on language
  // SLAM-1: English only, highest accuracy for English content
  // 'best': Universal model, supports 99+ languages
  const speechModel = (language === "en") ? "slam-1" : "best";
  console.log(`[ProcessRecording] Using speech model: ${speechModel}`);

  // Build request body per AssemblyAI documentation
  // https://www.assemblyai.com/docs/pre-recorded-audio/speaker-diarization
  // https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model
  // NOTE: Using LeMUR for summarization separately (works with all models including SLAM-1)
  const requestBody: Record<string, unknown> = {
    audio_url: audioUrl,
    // Speech model selection
    speech_model: speechModel,
    language_code: language,
    // Speaker diarization with exact count per docs
    // "speakers_expected gives best accuracy when you know the count"
    speaker_labels: true,
    speakers_expected: expectedSpeakers,
    // Additional features
    auto_highlights: true,
  };

  console.log(`[ProcessRecording] Request config: speech_model=${speechModel}, speakers_expected=${expectedSpeakers}`);

  // Submit transcription job
  const submitResponse = await fetch(`${ASSEMBLYAI_API_URL}/transcript`, {
    method: "POST",
    headers: {
      Authorization: assemblyAIKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    throw new Error(`AssemblyAI submission failed: ${errorText}`);
  }

  const submission = await submitResponse.json() as AssemblyAITranscript;
  console.log(`[ProcessRecording] AssemblyAI transcript ID: ${submission.id}`);

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes max

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const statusResponse = await fetch(
      `${ASSEMBLYAI_API_URL}/transcript/${submission.id}`,
      {
        headers: { Authorization: assemblyAIKey },
      }
    );

    const transcript = await statusResponse.json() as AssemblyAITranscript;

    if (transcript.status === "completed") {
      console.log("[ProcessRecording] AssemblyAI transcription complete");
      
      // Post-transcription validation: count unique speakers detected
      const detectedSpeakers = transcript.utterances 
        ? new Set(transcript.utterances.map(u => u.speaker)).size 
        : 0;
      const speakerMismatch = detectedSpeakers !== expectedSpeakers;
      
      if (speakerMismatch) {
        console.warn(`[ProcessRecording] Speaker mismatch detected: expected ${expectedSpeakers}, detected ${detectedSpeakers}`);
      } else {
        console.log(`[ProcessRecording] Speaker count matches: ${detectedSpeakers}`);
      }

      return {
        transcript,
        speechModel,
        language,
        detectedSpeakers,
        speakerMismatch,
      };
    }

    if (transcript.status === "error") {
      throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
    }

    console.log(`[ProcessRecording] AssemblyAI status: ${transcript.status}, attempt ${attempts + 1}`);
    attempts++;
  }

  throw new Error("AssemblyAI transcription timed out");
}

// Meeting context for summary generation
interface MeetingContext {
  title?: string | null;
  contactName?: string | null;
  contactCompany?: string | null;
  meetingType?: string | null;
  expectedSpeakers: number;
  speakerNames?: SpeakerMapping;
}

// Step 3: Generate summary using LeMUR
// LeMUR is AssemblyAI's LLM that works with any transcript, regardless of speech model
// Now uses context-aware prompts with structured output format
async function generateSummaryWithLemur(
  transcriptId: string,
  assemblyAIKey: string,
  meetingContext?: MeetingContext
): Promise<string> {
  console.log("[ProcessRecording] Generating summary with LeMUR...");
  console.log(`[ProcessRecording] Transcript ID for summary: ${transcriptId}`);

  try {
    // Build context section with meeting metadata
    const contextParts: string[] = [];
    
    if (meetingContext?.title) {
      contextParts.push(`Meeting Title: "${meetingContext.title}"`);
    }
    if (meetingContext?.meetingType) {
      contextParts.push(`Meeting Type: ${meetingContext.meetingType}`);
    }
    if (meetingContext?.contactName) {
      const contactInfo = meetingContext.contactCompany 
        ? `${meetingContext.contactName} (${meetingContext.contactCompany})`
        : meetingContext.contactName;
      contextParts.push(`Primary Contact/Client: ${contactInfo}`);
    }
    contextParts.push(`Number of Participants: ${meetingContext?.expectedSpeakers || 2}`);
    
    // Add speaker name mapping if available
    if (meetingContext?.speakerNames && Object.keys(meetingContext.speakerNames).length > 0) {
      const speakerList = Object.entries(meetingContext.speakerNames)
        .map(([label, name]) => `${label} = ${name}`)
        .join(', ');
      contextParts.push(`Identified Speakers: ${speakerList}`);
    }

    const contextSection = contextParts.length > 0 
      ? `\n\nMeeting Context:\n${contextParts.join('\n')}\n` 
      : '';

    const systemContext = `You are a legal documentation assistant specializing in meeting summaries for attorneys and legal professionals. Your summaries must be accurate, professional, and suitable for case files.${contextSection}`;

    const prompt = `Analyze this legal meeting transcript and provide a comprehensive summary with the following structure:

## Meeting Overview
A 2-3 sentence high-level summary of the meeting purpose and outcome.

## Key Discussion Points
Bullet points of the main topics discussed, in order of importance.

## Decisions Made
Any decisions or agreements reached during the meeting. If none, write "No formal decisions recorded."

## Action Items
Clear action items with responsible parties (use identified speaker names when available). If none, write "No action items identified."

## Notable Statements
Any legally significant statements, admissions, or quotes worth highlighting. If none, omit this section.

## Follow-up Required
Items that need follow-up or further attention. If none, write "No immediate follow-up required."

Guidelines:
- Use the identified speaker names when referring to participants (e.g., "John Smith" instead of "Speaker A")
- Be precise with dates, numbers, and legal terminology mentioned
- Keep the tone professional and objective
- Flag any potential concerns or issues for attorney review`;
    
    console.log("[ProcessRecording] LeMUR context:", systemContext.substring(0, 200) + "...");

    // Use LeMUR Task endpoint for more flexible prompting
    const response = await fetch("https://api.assemblyai.com/lemur/v3/generate/task", {
      method: "POST",
      headers: {
        Authorization: assemblyAIKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript_ids: [transcriptId],
        prompt: prompt,
        context: systemContext,
        final_model: "anthropic/claude-3-opus",
        max_output_size: 4000,
      }),
    });

    const responseText = await response.text();
    console.log(`[ProcessRecording] LeMUR response status: ${response.status}`);
    console.log(`[ProcessRecording] LeMUR response: ${responseText.substring(0, 500)}`);

    if (!response.ok) {
      console.error("[ProcessRecording] LeMUR summary failed:", responseText);
      return "Summary generation failed. Please retry processing.";
    }

    const result = JSON.parse(responseText) as { response?: string; summary?: string };
    const summary = result.response || result.summary;
    
    if (summary) {
      console.log(`[ProcessRecording] LeMUR summary generated successfully: ${summary.substring(0, 100)}...`);
      return summary;
    }

    console.warn("[ProcessRecording] LeMUR returned empty summary, response:", JSON.stringify(result));
    return "Summary not available.";
  } catch (error) {
    console.error("[ProcessRecording] LeMUR error:", error);
    return "Summary generation encountered an error.";
  }
}

// Step 3.5: Enhance speaker identification using LeMUR
// Analyzes transcript to identify speakers by name from context clues
interface SpeakerMapping {
  [key: string]: string; // e.g., {"Speaker A": "John Smith (Attorney)", "Speaker B": "Client"}
}

async function enhanceTranscriptSpeakers(
  transcriptId: string,
  assemblyAIKey: string,
  meetingContext: {
    contactName?: string | null;
    contactCompany?: string | null;
    expectedSpeakers: number;
  }
): Promise<SpeakerMapping> {
  console.log("[ProcessRecording] Enhancing speaker identification with LeMUR...");

  const contextHints: string[] = [];
  if (meetingContext.contactName) {
    contextHints.push(`Known participant: ${meetingContext.contactName}${meetingContext.contactCompany ? ` (${meetingContext.contactCompany})` : ''}`);
  }
  contextHints.push(`Expected number of speakers: ${meetingContext.expectedSpeakers}`);

  const prompt = `Analyze this transcript and identify the speakers based on contextual clues.

Look for:
1. Self-introductions ("Hi, I'm John Smith...", "This is Jane from...")
2. How speakers address each other by name ("Thanks, Michael", "John, can you...")
3. Role indicators (attorney-client dynamics, expert testimony patterns)
4. Professional identifiers mentioned ("As your attorney...", "Speaking as the defendant...")

${contextHints.join('\n')}

Return ONLY a valid JSON object mapping speaker labels to identified names/roles.
Format: {"Speaker A": "Name or Role", "Speaker B": "Name or Role"}

Rules:
- If you can confidently identify a speaker's name, use it
- If you can only identify their role, use a descriptive label like "Attorney", "Client", "Witness"
- If you cannot identify anything about a speaker, keep the original label like "Speaker A"
- Do not make up names - only use names that are explicitly mentioned in the transcript

Return ONLY the JSON object, no other text or explanation.`;

  try {
    const response = await fetch("https://api.assemblyai.com/lemur/v3/generate/task", {
      method: "POST",
      headers: {
        Authorization: assemblyAIKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript_ids: [transcriptId],
        prompt: prompt,
        final_model: "anthropic/claude-3-haiku", // Haiku is faster/cheaper for this task
        max_output_size: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("[ProcessRecording] Speaker enhancement failed:", errorText);
      return {};
    }

    const result = await response.json() as { response?: string };
    const responseText = result.response || "";
    
    // Extract JSON from response (handle potential text around it)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[ProcessRecording] No valid JSON in speaker enhancement response");
      return {};
    }

    const mapping = JSON.parse(jsonMatch[0]) as SpeakerMapping;
    console.log("[ProcessRecording] Speaker mapping identified:", JSON.stringify(mapping));
    return mapping;
  } catch (error) {
    console.warn("[ProcessRecording] Speaker enhancement error:", error);
    return {};
  }
}

// Step 4: Record usage for analytics
// Note: Trial is now time-based (7 days unlimited), not minute-based
interface UsageResult {
  success: boolean;
  minutes_recorded: number;
  has_subscription: boolean;
  polar_event_id?: string;
  error?: string;
}

async function recordUsageAndMeter(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  meetingId: string,
  durationSeconds: number,
  polarAccessToken?: string
): Promise<UsageResult> {
  console.log("[ProcessRecording] Recording usage for meeting...");
  
  // Round up to nearest minute for billing
  const durationMinutes = Math.ceil(durationSeconds / 60);
  console.log(`[ProcessRecording] Duration: ${durationSeconds}s = ${durationMinutes} minutes (rounded up)`);

  // Check if user has active subscription
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, polar_customer_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  const hasActiveSubscription = !!subscription;
  const polarCustomerId = subscription?.polar_customer_id;

  // Record usage in our database using the stored procedure (for analytics)
  let polarEventId: string | undefined;
  
  try {
    const { data: usageResult, error: usageError } = await supabase.rpc("record_usage", {
      p_user_id: userId,
      p_meeting_id: meetingId,
      p_minutes: durationMinutes,
      p_is_free_trial: false, // Kept for backward compatibility
      p_polar_event_id: polarEventId || null,
    });

    if (usageError) {
      console.error("[ProcessRecording] Error recording usage:", usageError);
    } else {
      console.log("[ProcessRecording] Usage recorded in database:", usageResult);
    }
  } catch (rpcError) {
    console.error("[ProcessRecording] RPC error:", rpcError);
  }

  return {
    success: true,
    minutes_recorded: durationMinutes,
    has_subscription: hasActiveSubscription,
    polar_event_id: polarEventId,
  };
}

// Main handler
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  let meetingId: string | null = null;

  try {
    const body = await req.json() as ProcessRequest;
    meetingId = body.meeting_id;

    if (!meetingId) {
      return new Response(
        JSON.stringify({ error: "Missing meeting_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ProcessRecording] Starting pipeline for meeting: ${meetingId}`);

    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cloudConvertApiKey = Deno.env.get("CLOUDCONVERT_API_KEY");
    const assemblyAIKey = Deno.env.get("ASSEMBLYAI_API_KEY");
    const polarAccessToken = Deno.env.get("POLAR_ACCESS_TOKEN");

    if (!cloudConvertApiKey) {
      throw new Error("CLOUDCONVERT_API_KEY not configured");
    }
    if (!assemblyAIKey) {
      throw new Error("ASSEMBLYAI_API_KEY not configured");
    }
    
    // Note: POLAR_ACCESS_TOKEN is optional - usage won't be metered if not set
    if (!polarAccessToken) {
      console.warn("[ProcessRecording] POLAR_ACCESS_TOKEN not configured - usage metering disabled");
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch meeting details with related data for context-aware processing
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select(`
        *,
        contact:contacts(id, first_name, last_name, company),
        meeting_type:meeting_types(id, name)
      `)
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      throw new Error(`Meeting not found: ${meetingError?.message}`);
    }

    if (!meeting.raw_audio_path) {
      throw new Error("Meeting has no audio file");
    }

    // Build meeting context for AI processing
    const contactName = meeting.contact 
      ? `${meeting.contact.first_name}${meeting.contact.last_name ? ' ' + meeting.contact.last_name : ''}`.trim()
      : null;
    const contactCompany = meeting.contact?.company || null;
    const meetingTypeName = meeting.meeting_type?.name || null;

    console.log(`[ProcessRecording] Found meeting, audio: ${meeting.raw_audio_path}`);
    console.log(`[ProcessRecording] Context: title="${meeting.title}", contact="${contactName}", type="${meetingTypeName}"`);

    // Get expected speakers and language from meeting (with defaults)
    const expectedSpeakers = meeting.expected_speakers || 2;
    const language = meeting.transcription_language || "en";

    // Update job status to processing
    await updateJobStatus(supabase, meetingId, "processing", "converting");

    // ============================================
    // STEP 1: Download raw audio
    // ============================================
    console.log("[ProcessRecording] Downloading raw audio...");
    await updateMeetingStatus(supabase, meetingId, "converting");

    const { data: audioBlob, error: downloadError } = await supabase.storage
      .from("meeting-audio")
      .download(meeting.raw_audio_path);

    if (downloadError || !audioBlob) {
      throw new Error(`Failed to download audio: ${downloadError?.message}`);
    }

    console.log(`[ProcessRecording] Downloaded audio, size: ${audioBlob.size} bytes`);

    // ============================================
    // STEP 2: Convert to MP3 using CloudConvert
    // ============================================
    const originalFormat = meeting.raw_audio_format || "webm";
    const mp3Blob = await convertToMp3(audioBlob, originalFormat, cloudConvertApiKey);
    console.log(`[ProcessRecording] Converted to MP3, size: ${mp3Blob.size} bytes`);

    // Upload MP3 to Supabase Storage
    const mp3Path = meeting.raw_audio_path.replace(/\.[^/.]+$/, ".mp3");
    const { error: uploadError } = await supabase.storage
      .from("meeting-audio")
      .upload(mp3Path, mp3Blob, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload MP3: ${uploadError.message}`);
    }

    console.log(`[ProcessRecording] MP3 uploaded to: ${mp3Path}`);

    // Update meeting with MP3 path
    await supabase
      .from("meetings")
      .update({ mp3_audio_path: mp3Path })
      .eq("id", meetingId);

    // ============================================
    // STEP 3: Transcribe with AssemblyAI (includes summarization)
    // ============================================
    await updateJobStatus(supabase, meetingId, "processing", "transcribing");
    await updateMeetingStatus(supabase, meetingId, "transcribing");

    // Get signed URL for the MP3 file
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("meeting-audio")
      .createSignedUrl(mp3Path, 3600); // 1 hour expiry

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(`Failed to get signed URL: ${signedUrlError?.message}`);
    }

    // Transcribe with SLAM-1 model and built-in summarization
    const transcriptionResult = await transcribeAudio(
      signedUrlData.signedUrl,
      assemblyAIKey,
      expectedSpeakers,
      language
    );

    const { transcript, speechModel, detectedSpeakers, speakerMismatch } = transcriptionResult;

    // ============================================
    // STEP 4: Enhance speaker identification using AI
    // ============================================
    const speakerNames = await enhanceTranscriptSpeakers(
      transcript.id,
      assemblyAIKey,
      {
        contactName,
        contactCompany,
        expectedSpeakers,
      }
    );

    // ============================================
    // STEP 5: Generate summary using LeMUR with context
    // ============================================
    const summary = await generateSummaryWithLemur(
      transcript.id,
      assemblyAIKey,
      {
        title: meeting.title,
        contactName,
        contactCompany,
        meetingType: meetingTypeName,
        expectedSpeakers,
        speakerNames,
      }
    );

    // ============================================
    // STEP 6: Update meeting with speaker validation results and AI speaker names
    // ============================================
    console.log("[ProcessRecording] Updating meeting with transcription metadata...");
    await supabase
      .from("meetings")
      .update({
        detected_speakers: detectedSpeakers,
        speaker_mismatch: speakerMismatch,
        transcription_language: language,
        speech_model_used: speechModel,
        speaker_names: Object.keys(speakerNames).length > 0 ? speakerNames : null,
      })
      .eq("id", meetingId);

    // ============================================
    // STEP 7: Save transcript and segments
    // ============================================
    console.log("[ProcessRecording] Saving transcript...");

    // Delete existing transcript/segments for this meeting (in case of retry)
    await supabase.from("transcript_segments").delete().eq("meeting_id", meetingId);
    await supabase.from("transcripts").delete().eq("meeting_id", meetingId);

    // Save main transcript with summary from LeMUR
    const { error: transcriptError } = await supabase
      .from("transcripts")
      .insert({
        meeting_id: meetingId,
        full_text: transcript.text || "",
        summary: summary,
        assemblyai_transcript_id: transcript.id,
      });

    if (transcriptError) {
      console.error("[ProcessRecording] Error saving transcript:", transcriptError);
    }

    // Save transcript segments (utterances with speaker info)
    // Use AI-identified speaker names if available, otherwise default to "Speaker X"
    if (transcript.utterances && transcript.utterances.length > 0) {
      const segments = transcript.utterances.map((utterance) => {
        // Format speaker label: "A" -> "Speaker A", "B" -> "Speaker B", etc.
        const defaultLabel = utterance.speaker.toLowerCase().startsWith('speaker') 
          ? utterance.speaker 
          : `Speaker ${utterance.speaker}`;
        
        // Use AI-identified name if available
        const speakerLabel = speakerNames[defaultLabel] || defaultLabel;
        
        return {
          meeting_id: meetingId,
          speaker: speakerLabel,
          text: utterance.text,
          start_ms: utterance.start,
          end_ms: utterance.end,
          confidence: utterance.confidence,
        };
      });

      const { error: segmentsError } = await supabase
        .from("transcript_segments")
        .insert(segments);

      if (segmentsError) {
        console.error("[ProcessRecording] Error saving segments:", segmentsError);
      } else {
        console.log(`[ProcessRecording] Saved ${segments.length} transcript segments`);
      }
    }

    // ============================================
    // STEP 8: Record usage and send to Polar
    // ============================================
    let usageResult: UsageResult | null = null;
    if (meeting.duration_seconds > 0) {
      usageResult = await recordUsageAndMeter(
        supabase,
        meeting.user_id,
        meetingId,
        meeting.duration_seconds,
        polarAccessToken
      );
      console.log("[ProcessRecording] Usage result:", usageResult);
    } else {
      console.log("[ProcessRecording] Skipping usage recording (duration is 0)");
    }

    // ============================================
    // STEP 9: Update status to ready
    // ============================================
    await updateJobStatus(supabase, meetingId, "completed", null);
    await updateMeetingStatus(supabase, meetingId, "ready");

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[ProcessRecording] Pipeline complete in ${processingTime}s for meeting: ${meetingId}`);

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id: meetingId,
        transcript_id: transcript.id,
        processing_time_seconds: parseFloat(processingTime),
        stats: {
          segments: transcript.utterances?.length || 0,
          text_length: transcript.text?.length || 0,
          has_summary: summary !== "Summary not available." && summary !== "Summary generation failed. Please retry processing." && summary !== "Summary generation encountered an error.",
        },
        speaker_validation: {
          expected: expectedSpeakers,
          detected: detectedSpeakers,
          mismatch: speakerMismatch,
          identified_names: Object.keys(speakerNames).length > 0 ? speakerNames : null,
        },
        model: {
          speech_model: speechModel,
          language: language,
        },
        usage: usageResult ? {
          minutes_recorded: usageResult.minutes_recorded,
          has_subscription: usageResult.has_subscription,
          polar_event_id: usageResult.polar_event_id,
        } : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[ProcessRecording] Pipeline error:", error);

    // Update status to failed
    if (meetingId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const errorMessage = error instanceof Error ? error.message : "Processing failed";
        
        await updateMeetingStatus(supabase, meetingId, "failed", { error_message: errorMessage });
        await updateJobStatus(supabase, meetingId, "failed", null, errorMessage);
      } catch (updateError) {
        console.error("[ProcessRecording] Failed to update error status:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Processing failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
