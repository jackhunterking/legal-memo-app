// Supabase Edge Function: process-meeting
// Orchestrates the complete meeting processing pipeline using AssemblyAI
// - Transcription with speaker diarization
// - LeMUR for summary, action items, and legal analysis

/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// AssemblyAI API base URL
const ASSEMBLYAI_API_URL = "https://api.assemblyai.com/v2";

// Types
interface ProcessMeetingRequest {
  meeting_id: string;
}

interface AssemblyAIConfig {
  transcription: {
    speaker_labels: boolean;
    auto_chapters: boolean;
    entity_detection: boolean;
    language_code: string;
  };
  lemur: {
    default_model: string;
    summary_model: string;
    tasks_model: string;
    analysis_model: string;
  };
}

interface TranscriptUtterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

interface TranscriptChapter {
  headline: string;
  summary: string;
  start: number;
  end: number;
}

interface TranscriptEntity {
  text: string;
  entity_type: string;
  start: number;
  end: number;
}

interface TranscriptResponse {
  id: string;
  status: string;
  text: string;
  utterances?: TranscriptUtterance[];
  chapters?: TranscriptChapter[];
  entities?: TranscriptEntity[];
  error?: string;
}

interface LegalAnalysis {
  meeting_overview: {
    one_sentence_summary: string;
    participants: Array<{ role: string; name?: string }>;
    topics: string[];
  };
  key_facts_stated: Array<{ fact: string; stated_by: string; certainty: string }>;
  legal_issues_discussed: Array<{ issue: string; raised_by: string }>;
  decisions_made: Array<{ decision: string }>;
  risks_or_concerns_raised: Array<{ risk: string; raised_by: string }>;
  follow_up_actions: Array<{ action: string; owner: string; deadline?: string }>;
  open_questions: Array<{ question: string; asked_by: string }>;
}

// Helper: Make AssemblyAI API request
async function assemblyAIRequest(
  endpoint: string,
  method: string,
  apiKey: string,
  body?: object
): Promise<Response> {
  const options: RequestInit = {
    method,
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/json",
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  return fetch(`${ASSEMBLYAI_API_URL}${endpoint}`, options);
}

// Helper: Poll for transcript completion
async function waitForTranscript(
  transcriptId: string,
  apiKey: string,
  maxAttempts = 120 // 10 minutes max (5s intervals)
): Promise<TranscriptResponse> {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const response = await assemblyAIRequest(
      `/transcript/${transcriptId}`,
      "GET",
      apiKey
    );
    
    const result = await response.json() as TranscriptResponse;
    
    if (result.status === "completed") {
      return result;
    }
    
    if (result.status === "error") {
      throw new Error(`Transcription failed: ${result.error}`);
    }
    
    // Wait 5 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
    
    console.log(`[ProcessMeeting] Transcription status: ${result.status}, attempt ${attempts}`);
  }
  
  throw new Error("Transcription timed out");
}

// Helper: Map AssemblyAI speaker labels to roles
function mapSpeakerToRole(
  speaker: string,
  speakerRoles: Map<string, string>
): string {
  return speakerRoles.get(speaker) || "UNKNOWN";
}

// Helper: Parse LeMUR JSON response
function parseLemurResponse<T>(response: string): T | null {
  try {
    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch (error) {
    console.error("[ProcessMeeting] Failed to parse LeMUR response:", error);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  let meetingId: string | null = null;

  try {
    const { meeting_id } = (await req.json()) as ProcessMeetingRequest;
    meetingId = meeting_id;

    if (!meeting_id) {
      return new Response(
        JSON.stringify({ error: "Missing meeting_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ProcessMeeting] Starting processing for meeting: ${meeting_id}`);

    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const assemblyAIKey = Deno.env.get("ASSEMBLYAI_API_KEY");

    if (!assemblyAIKey) {
      throw new Error("ASSEMBLYAI_API_KEY not configured");
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch meeting details
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*, user_id, audio_path, duration_seconds")
      .eq("id", meeting_id)
      .single();

    if (meetingError || !meeting) {
      throw new Error(`Meeting not found: ${meetingError?.message}`);
    }

    if (!meeting.audio_path) {
      throw new Error("Meeting has no audio file");
    }

    console.log(`[ProcessMeeting] Found meeting, audio path: ${meeting.audio_path}`);

    // Fetch AI config
    const { data: configData } = await supabase
      .from("ai_config")
      .select("value")
      .eq("key", "assemblyai")
      .single();

    const config: AssemblyAIConfig = configData?.value || {
      transcription: {
        speaker_labels: true,
        auto_chapters: true,
        entity_detection: true,
        language_code: "en",
      },
      lemur: {
        default_model: "anthropic/claude-3-5-sonnet",
        summary_model: "anthropic/claude-3-5-sonnet",
        tasks_model: "anthropic/claude-3-haiku",
        analysis_model: "anthropic/claude-3-5-sonnet",
      },
    };

    // Fetch prompt templates
    const { data: promptsData } = await supabase
      .from("prompt_templates")
      .select("name, prompt, model")
      .eq("is_active", true);

    const prompts: Record<string, { prompt: string; model: string }> = {};
    for (const p of promptsData || []) {
      prompts[p.name] = { prompt: p.prompt, model: p.model };
    }

    // Get signed URL for the audio file
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("meeting-audio")
      .createSignedUrl(meeting.audio_path, 3600); // 1 hour expiry

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(`Failed to get audio URL: ${signedUrlError?.message}`);
    }

    console.log("[ProcessMeeting] Got signed URL for audio file");

    // ============================================
    // STEP 1: Submit transcription to AssemblyAI
    // ============================================
    console.log("[ProcessMeeting] Submitting to AssemblyAI for transcription...");

    const transcriptResponse = await assemblyAIRequest(
      "/transcript",
      "POST",
      assemblyAIKey,
      {
        audio_url: signedUrlData.signedUrl,
        speaker_labels: config.transcription.speaker_labels,
        auto_chapters: config.transcription.auto_chapters,
        entity_detection: config.transcription.entity_detection,
        language_code: config.transcription.language_code,
      }
    );

    const transcriptSubmission = await transcriptResponse.json();
    
    if (!transcriptSubmission.id) {
      throw new Error(`Failed to submit transcription: ${JSON.stringify(transcriptSubmission)}`);
    }

    console.log(`[ProcessMeeting] Transcription submitted, ID: ${transcriptSubmission.id}`);

    // ============================================
    // STEP 2: Wait for transcription to complete
    // ============================================
    const transcript = await waitForTranscript(transcriptSubmission.id, assemblyAIKey);
    
    console.log(`[ProcessMeeting] Transcription complete, text length: ${transcript.text?.length || 0}`);
    console.log(`[ProcessMeeting] Speakers detected: ${transcript.utterances?.length || 0} utterances`);
    console.log(`[ProcessMeeting] Chapters: ${transcript.chapters?.length || 0}`);
    console.log(`[ProcessMeeting] Entities: ${transcript.entities?.length || 0}`);

    // ============================================
    // STEP 3: Save transcript segments
    // ============================================
    console.log("[ProcessMeeting] Saving transcript segments...");

    // Delete existing segments for this meeting
    await supabase
      .from("transcript_segments")
      .delete()
      .eq("meeting_id", meeting_id);

    // Map speakers to potential roles (will be refined by LeMUR analysis)
    const speakerRoles = new Map<string, string>();
    const uniqueSpeakers = new Set(transcript.utterances?.map(u => u.speaker) || []);
    
    // Initial mapping - will be updated after LeMUR analysis
    let speakerIndex = 0;
    for (const speaker of uniqueSpeakers) {
      // Default: first speaker is LAWYER, second is CLIENT
      if (speakerIndex === 0) {
        speakerRoles.set(speaker, "LAWYER");
      } else if (speakerIndex === 1) {
        speakerRoles.set(speaker, "CLIENT");
      } else {
        speakerRoles.set(speaker, "OTHER");
      }
      speakerIndex++;
    }

    // Save utterances as transcript segments
    if (transcript.utterances && transcript.utterances.length > 0) {
      const segments = transcript.utterances.map(utterance => ({
        meeting_id: meeting_id,
        speaker_label: mapSpeakerToRole(utterance.speaker, speakerRoles),
        speaker_name: `Speaker ${utterance.speaker}`,
        start_ms: utterance.start,
        end_ms: utterance.end,
        text: utterance.text,
        confidence: utterance.confidence,
      }));

      const { error: segmentError } = await supabase
        .from("transcript_segments")
        .insert(segments);

      if (segmentError) {
        console.error("[ProcessMeeting] Error saving segments:", segmentError);
      } else {
        console.log(`[ProcessMeeting] Saved ${segments.length} transcript segments`);
      }
    }

    // ============================================
    // STEP 4: LeMUR - Generate Summary
    // ============================================
    console.log("[ProcessMeeting] Generating summary with LeMUR...");

    const summaryContext = prompts.summary_context?.prompt || 
      "This is a legal meeting between a lawyer/legal professional and their client.";

    const summaryResponse = await assemblyAIRequest(
      "/lemur/v3/generate/summary",
      "POST",
      assemblyAIKey,
      {
        transcript_ids: [transcript.id],
        final_model: config.lemur.summary_model,
        context: summaryContext,
        answer_format: "A concise professional summary suitable for legal documentation.",
      }
    );

    const summaryResult = await summaryResponse.json();
    const summary = summaryResult.response || "Summary generation failed.";
    
    console.log("[ProcessMeeting] Summary generated");

    // ============================================
    // STEP 5: LeMUR - Extract Action Items
    // ============================================
    console.log("[ProcessMeeting] Extracting action items with LeMUR...");

    const actionItemsResponse = await assemblyAIRequest(
      "/lemur/v3/generate/action-items",
      "POST",
      assemblyAIKey,
      {
        transcript_ids: [transcript.id],
        final_model: config.lemur.tasks_model,
        context: "This is a legal meeting. Extract all tasks and follow-up items.",
      }
    );

    const actionItemsResult = await actionItemsResponse.json();
    const actionItems = actionItemsResult.response || [];
    
    console.log(`[ProcessMeeting] Action items extracted: ${Array.isArray(actionItems) ? actionItems.length : 'N/A'}`);

    // ============================================
    // STEP 6: LeMUR - Custom Legal Analysis
    // ============================================
    console.log("[ProcessMeeting] Running legal analysis with LeMUR...");

    const legalAnalysisPrompt = prompts.legal_analysis?.prompt || 
      "Analyze this legal meeting and provide key facts, legal issues, decisions, risks, and open questions.";

    const legalAnalysisResponse = await assemblyAIRequest(
      "/lemur/v3/generate/task",
      "POST",
      assemblyAIKey,
      {
        transcript_ids: [transcript.id],
        final_model: config.lemur.analysis_model,
        prompt: legalAnalysisPrompt,
      }
    );

    const legalAnalysisResult = await legalAnalysisResponse.json();
    const legalAnalysisRaw = legalAnalysisResult.response || "{}";
    
    // Parse the legal analysis JSON
    let legalAnalysis: LegalAnalysis | null = parseLemurResponse<LegalAnalysis>(legalAnalysisRaw);
    
    // Build meeting overview from analysis or fallback
    const meetingOverview = legalAnalysis?.meeting_overview || {
      one_sentence_summary: summary,
      participants: Array.from(speakerRoles.entries()).map(([speaker, role]) => ({
        role,
        name: `Speaker ${speaker}`,
      })),
      topics: transcript.chapters?.map(c => c.headline) || ["General discussion"],
    };

    console.log("[ProcessMeeting] Legal analysis complete");

    // ============================================
    // STEP 7: Save AI Output
    // ============================================
    console.log("[ProcessMeeting] Saving AI output...");

    const aiOutput = {
      meeting_id: meeting_id,
      provider: "assemblyai",
      model: config.lemur.analysis_model,
      meeting_overview: meetingOverview,
      key_facts_stated: legalAnalysis?.key_facts_stated || [],
      legal_issues_discussed: legalAnalysis?.legal_issues_discussed || [],
      decisions_made: legalAnalysis?.decisions_made || [],
      risks_or_concerns_raised: legalAnalysis?.risks_or_concerns_raised || [],
      follow_up_actions: legalAnalysis?.follow_up_actions || [],
      open_questions: legalAnalysis?.open_questions || [],
      disclaimer: "This summary is AI-generated for documentation support and may contain errors. It is not legal advice.",
    };

    const { error: aiSaveError } = await supabase
      .from("ai_outputs")
      .upsert(aiOutput, { onConflict: "meeting_id" });

    if (aiSaveError) {
      console.error("[ProcessMeeting] Error saving AI output:", aiSaveError);
    } else {
      console.log("[ProcessMeeting] AI output saved");
    }

    // ============================================
    // STEP 8: Save Tasks
    // ============================================
    console.log("[ProcessMeeting] Saving tasks...");

    // Delete existing tasks for this meeting
    await supabase
      .from("meeting_tasks")
      .delete()
      .eq("meeting_id", meeting_id);

    // Combine action items from LeMUR action-items and legal analysis follow_up_actions
    const allTasks: Array<{
      meeting_id: string;
      user_id: string;
      title: string;
      description: string | null;
      priority: string;
      owner: string | null;
      completed: boolean;
    }> = [];

    // From LeMUR action items (string array)
    if (Array.isArray(actionItems)) {
      for (const item of actionItems) {
        if (typeof item === "string" && item.trim()) {
          allTasks.push({
            meeting_id: meeting_id,
            user_id: meeting.user_id,
            title: item.trim(),
            description: null,
            priority: "medium",
            owner: null,
            completed: false,
          });
        }
      }
    }

    // From legal analysis follow_up_actions
    if (legalAnalysis?.follow_up_actions) {
      for (const action of legalAnalysis.follow_up_actions) {
        // Avoid duplicates
        const exists = allTasks.some(t => 
          t.title.toLowerCase() === action.action.toLowerCase()
        );
        
        if (!exists && action.action) {
          allTasks.push({
            meeting_id: meeting_id,
            user_id: meeting.user_id,
            title: action.action,
            description: action.deadline ? `Deadline: ${action.deadline}` : null,
            priority: "medium",
            owner: action.owner || null,
            completed: false,
          });
        }
      }
    }

    if (allTasks.length > 0) {
      const { error: taskError } = await supabase
        .from("meeting_tasks")
        .insert(allTasks);

      if (taskError) {
        console.error("[ProcessMeeting] Error saving tasks:", taskError);
      } else {
        console.log(`[ProcessMeeting] Saved ${allTasks.length} tasks`);
      }
    }

    // ============================================
    // STEP 9: Update Meeting Status
    // ============================================
    console.log("[ProcessMeeting] Updating meeting status to ready...");

    const { error: updateError } = await supabase
      .from("meetings")
      .update({
        status: "ready",
        error_message: null,
      })
      .eq("id", meeting_id);

    if (updateError) {
      throw new Error(`Failed to update meeting status: ${updateError.message}`);
    }

    // Update job status
    await supabase
      .from("meeting_jobs")
      .update({ status: "completed" })
      .eq("meeting_id", meeting_id);

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[ProcessMeeting] Processing complete in ${processingTime}s for meeting: ${meeting_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id: meeting_id,
        transcript_id: transcript.id,
        processing_time_seconds: parseFloat(processingTime),
        stats: {
          utterances: transcript.utterances?.length || 0,
          chapters: transcript.chapters?.length || 0,
          entities: transcript.entities?.length || 0,
          tasks: allTasks.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[ProcessMeeting] Error:", error);

    // Update meeting status to failed
    if (meetingId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        await supabase
          .from("meetings")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "Processing failed",
          })
          .eq("id", meetingId);

        await supabase
          .from("meeting_jobs")
          .update({
            status: "failed",
            last_error: error instanceof Error ? error.message : "Unknown error",
          })
          .eq("meeting_id", meetingId);
      } catch (updateError) {
        console.error("[ProcessMeeting] Failed to update error status:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Processing failed",
        details: String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

