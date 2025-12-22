// Supabase Edge Function for AI-enhanced task creation
// Analyzes task title with meeting context to suggest owner and deadline

/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EnhanceTaskRequest {
  meeting_id: string;
  task_title: string;
}

interface EnhanceTaskResponse {
  owner: string | null;
  suggested_deadline: string | null;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { meeting_id, task_title } =
      (await req.json()) as EnhanceTaskRequest;

    if (!meeting_id || !task_title) {
      return new Response(
        JSON.stringify({ error: "Missing meeting_id or task_title" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[EnhanceTask] Enhancing task for meeting: ${meeting_id}`);
    console.log(`[EnhanceTask] Task title: ${task_title}`);

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch meeting data with AI output
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select(
        `
        *,
        ai_output:ai_outputs(*)
      `
      )
      .eq("id", meeting_id)
      .single();

    if (meetingError || !meeting) {
      console.error("[EnhanceTask] Meeting fetch error:", meetingError);
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract participants from AI output
    const participants =
      (meeting.ai_output as { meeting_overview?: { participants?: Array<{ name?: string }> } })?.meeting_overview?.participants || [];
    const participantNames = participants
      .filter((p: { name?: string }) => p.name && p.name !== "Unknown")
      .map((p: { name?: string }) => p.name);

    // Extract summary context
    const summaryContext =
      (meeting.ai_output as { meeting_overview?: { one_sentence_summary?: string } })?.meeting_overview?.one_sentence_summary ||
      "Meeting details not available";

    // Extract any existing follow-up actions for context
    const existingActions = (meeting.ai_output as { follow_up_actions?: Array<{ action: string; owner: string; deadline?: string }> })?.follow_up_actions || [];
    const actionsContext = existingActions
      .map(
        (a: { action: string; owner: string; deadline?: string }) =>
          `${a.action} (Owner: ${a.owner}, Deadline: ${a.deadline || "none"})`
      )
      .join("\n");

    console.log(
      `[EnhanceTask] Found ${participantNames.length} participants`
    );
    console.log(`[EnhanceTask] Context: ${summaryContext}`);

    // Use OpenAI via Deno KV or direct API call to suggest owner and deadline
    // For now, we'll use a simple heuristic approach
    // In production, you'd integrate with OpenAI API here

    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");

    let enhancedTask: EnhanceTaskResponse = {
      owner: null,
      suggested_deadline: null,
    };

    if (openAiApiKey) {
      // Call OpenAI to analyze task and suggest owner/deadline
      try {
        const prompt = `You are a legal assistant helping analyze meeting tasks.

Meeting Context:
Summary: ${summaryContext}
Participants: ${participantNames.join(", ") || "Not specified"}

Existing Action Items:
${actionsContext || "None"}

New Task:
"${task_title}"

Based on the task description and meeting context, suggest:
1. Owner: Which participant (if any) should own this task? Return their exact name from the participants list, or null if unclear.
2. Deadline: When should this task be completed? Return an ISO date string (YYYY-MM-DD) or null if no clear timeframe.

Respond in JSON format:
{
  "owner": "Participant Name or null",
  "suggested_deadline": "YYYY-MM-DD or null",
  "reasoning": "Brief explanation"
}

Important:
- Only suggest an owner if a participant is explicitly mentioned or clearly implied
- Only suggest a deadline if a timeframe is mentioned in the task
- Be conservative - prefer null over guessing`;

        const openaiResponse = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openAiApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content:
                    "You are a helpful assistant that analyzes legal meeting tasks and suggests task metadata. Always respond with valid JSON.",
                },
                {
                  role: "user",
                  content: prompt,
                },
              ],
              response_format: { type: "json_object" },
              temperature: 0.3,
            }),
          }
        );

        if (openaiResponse.ok) {
          const aiResult = await openaiResponse.json();
          const suggestion = JSON.parse(aiResult.choices[0].message.content);

          console.log("[EnhanceTask] AI suggestion:", suggestion);

          enhancedTask = {
            owner: suggestion.owner === "null" ? null : suggestion.owner,
            suggested_deadline:
              suggestion.suggested_deadline === "null"
                ? null
                : suggestion.suggested_deadline,
          };
        } else {
          console.warn(
            "[EnhanceTask] OpenAI API error, using fallback logic"
          );
        }
      } catch (aiError) {
        console.error("[EnhanceTask] AI processing error:", aiError);
        // Fallback to basic heuristics below
      }
    }

    // Fallback heuristics if AI not available or failed
    if (!enhancedTask.owner && participantNames.length > 0) {
      // Check if task mentions any participant by name
      const taskLower = task_title.toLowerCase();
      for (const name of participantNames) {
        if (name && taskLower.includes(name.toLowerCase())) {
          enhancedTask.owner = name;
          break;
        }
      }
    }

    // Check for deadline keywords
    if (!enhancedTask.suggested_deadline) {
      const taskLower = task_title.toLowerCase();
      const today = new Date();

      if (
        taskLower.includes("urgent") ||
        taskLower.includes("asap") ||
        taskLower.includes("immediately")
      ) {
        // Suggest tomorrow
        today.setDate(today.getDate() + 1);
        enhancedTask.suggested_deadline = today.toISOString().split("T")[0];
      } else if (taskLower.includes("this week")) {
        // Suggest end of week
        const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
        today.setDate(today.getDate() + daysUntilFriday);
        enhancedTask.suggested_deadline = today.toISOString().split("T")[0];
      } else if (taskLower.includes("next week")) {
        // Suggest next Friday
        today.setDate(today.getDate() + 7 + (5 - today.getDay()));
        enhancedTask.suggested_deadline = today.toISOString().split("T")[0];
      } else if (taskLower.includes("month")) {
        // Suggest end of month
        today.setMonth(today.getMonth() + 1, 0);
        enhancedTask.suggested_deadline = today.toISOString().split("T")[0];
      }
    }

    console.log(
      `[EnhanceTask] Enhanced task - Owner: ${enhancedTask.owner}, Deadline: ${enhancedTask.suggested_deadline}`
    );

    return new Response(JSON.stringify(enhancedTask), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[EnhanceTask] Error:", error);

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Task enhancement failed",
        details: String(error),
        // Return empty suggestions on error
        owner: null,
        suggested_deadline: null,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
