import { supabase } from '@/lib/supabase';
import { generateObject } from '@rork-ai/toolkit-sdk';
import { z } from 'zod';


const STT_API_URL = 'https://toolkit.rork.com/stt/transcribe/';

export type ProcessingStep = 'uploading' | 'transcribing' | 'summarizing' | 'actions' | 'indexing' | 'complete';

export interface ProcessingProgress {
  step: ProcessingStep;
  error?: string;
}

// Schema for AI-powered speaker attribution
const SpeakerSegmentSchema = z.object({
  segments: z.array(z.object({
    speaker_label: z.enum(['LAWYER', 'CLIENT', 'OTHER', 'UNKNOWN']),
    speaker_name: z.string().nullable().describe('Name of the speaker if mentioned, otherwise null'),
    text: z.string().describe('The text spoken by this speaker'),
    position: z.number().describe('Percentage through the transcript (0-100) where this segment starts'),
  })),
  speaker_mapping: z.array(z.object({
    label: z.enum(['LAWYER', 'CLIENT', 'OTHER', 'UNKNOWN']),
    name: z.string().nullable(),
    reasoning: z.string().describe('Brief explanation of why this person was identified as this role'),
  })),
});

export interface AttributedSegment {
  speaker_label: 'LAWYER' | 'CLIENT' | 'OTHER' | 'UNKNOWN';
  speaker_name: string | null;
  text: string;
  start_ms: number;
  end_ms: number;
}

const MeetingOverviewSchema = z.object({
  one_sentence_summary: z.string(),
  participants: z.array(z.object({
    label: z.enum(['LAWYER', 'CLIENT', 'OTHER', 'UNKNOWN']),
    name: z.string().nullable(),
  })),
  topics: z.array(z.string()),
});

const SupportSchema = z.object({
  start_ms: z.number(),
  end_ms: z.number(),
});

const TaskSchema = z.object({
  title: z.string().describe('Short, actionable task description'),
  description: z.string().nullable().optional().describe('Detailed description of the task'),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  owner: z.string().nullable().optional().describe('Person responsible for the task (e.g., "Lawyer", "Client", or specific name)'),
  owner_role: z.enum(['LAWYER', 'CLIENT', 'OTHER', 'UNKNOWN']).optional().default('UNKNOWN').describe('Role of the task owner'),
  suggested_reminder: z.string().nullable().optional().describe('Suggested reminder date/time in ISO format, or null'),
});

const AIOutputSchema = z.object({
  meeting_overview: MeetingOverviewSchema,
  key_facts_stated: z.array(z.object({
    fact: z.string(),
    stated_by: z.enum(['LAWYER', 'CLIENT', 'OTHER', 'UNKNOWN']).optional().default('UNKNOWN'),
    support: z.array(SupportSchema).optional().default([]),
    certainty: z.enum(['explicit', 'unclear']).optional().default('explicit'),
  })),
  legal_issues_discussed: z.array(z.object({
    issue: z.string(),
    raised_by: z.enum(['LAWYER', 'CLIENT', 'OTHER', 'UNKNOWN']).optional().default('UNKNOWN'),
    support: z.array(SupportSchema).optional().default([]),
    certainty: z.enum(['explicit', 'unclear']).optional().default('explicit'),
  })),
  decisions_made: z.array(z.object({
    decision: z.string(),
    support: z.array(SupportSchema).optional().default([]),
    certainty: z.enum(['explicit', 'unclear']).optional().default('explicit'),
  })),
  risks_or_concerns_raised: z.array(z.object({
    risk: z.string(),
    raised_by: z.enum(['LAWYER', 'CLIENT', 'OTHER', 'UNKNOWN']).optional().default('UNKNOWN'),
    support: z.array(SupportSchema).optional().default([]),
    certainty: z.enum(['explicit', 'unclear']).optional().default('explicit'),
  })),
  follow_up_actions: z.array(z.object({
    action: z.string(),
    owner: z.enum(['LAWYER', 'CLIENT', 'OTHER', 'UNKNOWN']).optional().default('UNKNOWN'),
    deadline: z.string().nullable().optional(),
    support: z.array(SupportSchema).optional().default([]),
    certainty: z.enum(['explicit', 'unclear']).optional().default('explicit'),
  })),
  open_questions: z.array(z.object({
    question: z.string(),
    asked_by: z.enum(['LAWYER', 'CLIENT', 'OTHER', 'UNKNOWN']).optional().default('UNKNOWN'),
    support: z.array(SupportSchema).optional().default([]),
    certainty: z.enum(['explicit', 'unclear']).optional().default('explicit'),
  })),
  tasks: z.array(TaskSchema).optional().default([]).describe('List of actionable tasks extracted from the meeting'),
});

/**
 * AI-powered speaker attribution function
 * Analyzes transcript and identifies different speakers, attributing text to LAWYER, CLIENT, or OTHER
 */
async function attributeSpeakers(transcriptText: string, durationSeconds: number): Promise<AttributedSegment[]> {
  console.log('[MeetingProcessor] Starting AI speaker attribution...');
  
  if (!transcriptText || transcriptText.trim().length < 10) {
    console.log('[MeetingProcessor] Transcript too short for speaker attribution');
    return [{
      speaker_label: 'UNKNOWN',
      speaker_name: null,
      text: transcriptText || 'No speech detected.',
      start_ms: 0,
      end_ms: durationSeconds * 1000,
    }];
  }

  const prompt = `You are an expert meeting analyst for a law firm. Your job is to identify different speakers in ANY type of meeting recording.

TRANSCRIPT:
${transcriptText}

CONTEXT: This is a recording from a law firm. It could be:
- A client consultation
- An internal team meeting
- A phone call
- A casual conversation
- A case discussion
- Administrative planning
- ANY other type of meeting or conversation

INSTRUCTIONS:
1. Split the transcript into segments based on when the speaker changes.
2. Identify speakers using these guidelines:

   LAWYER (law firm staff - attorneys, paralegals, assistants):
   - Leads or facilitates the conversation
   - Provides information, advice, or updates
   - Uses professional/formal language
   - Asks clarifying questions
   - Discusses schedules, cases, or procedures

   CLIENT (external person receiving services):
   - Describes their situation or needs
   - Asks questions seeking help or information
   - Provides personal details or facts
   - Responds to questions from staff

   OTHER (third parties):
   - Witnesses, opposing counsel, vendors, etc.
   - Anyone who isn't clearly staff or client

3. For each segment, estimate its position (0-100%) through the conversation.

4. Include speaker names if mentioned in the conversation.

CRITICAL RULES:
- ALWAYS create at least one segment with the full transcript text
- If there's only one speaker or you can't distinguish, use LAWYER as default (it's a law firm recording)
- Never return empty segments - include ALL the spoken content
- It's okay to use UNKNOWN if genuinely uncertain, but prefer making a reasonable guess
- Don't split mid-sentence - keep complete thoughts together`;

  try {
    const result = await generateObject({
      messages: [{ role: 'user', content: prompt }],
      schema: SpeakerSegmentSchema,
    });

    console.log('[MeetingProcessor] Speaker attribution complete:', result.segments.length, 'segments identified');
    console.log('[MeetingProcessor] Speaker mapping:', JSON.stringify(result.speaker_mapping, null, 2));

    // Convert positions to milliseconds and calculate end times
    const totalDurationMs = durationSeconds * 1000;
    const segments: AttributedSegment[] = result.segments.map((seg, index) => {
      const startMs = Math.floor((seg.position / 100) * totalDurationMs);
      // End time is either the start of next segment or end of recording
      const nextPosition = index < result.segments.length - 1 
        ? result.segments[index + 1].position 
        : 100;
      const endMs = Math.floor((nextPosition / 100) * totalDurationMs);

      return {
        speaker_label: seg.speaker_label,
        speaker_name: seg.speaker_name,
        text: seg.text,
        start_ms: startMs,
        end_ms: endMs,
      };
    });

    return segments;
  } catch (error) {
    console.error('[MeetingProcessor] Speaker attribution failed:', error);
    // Fallback to single segment with UNKNOWN speaker
    return [{
      speaker_label: 'UNKNOWN',
      speaker_name: null,
      text: transcriptText,
      start_ms: 0,
      end_ms: durationSeconds * 1000,
    }];
  }
}

/**
 * Helper function to format milliseconds as MM:SS
 */
function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Generate a smart fallback summary from the transcript text
 */
function generateSmartFallbackSummary(transcriptText: string, durationSeconds: number): string {
  const durationMinutes = Math.round(durationSeconds / 60);
  
  if (!transcriptText || transcriptText.trim().length < 10) {
    return `${durationMinutes}-minute recording with limited audio clarity.`;
  }
  
  // Extract the first meaningful sentence or phrase
  const cleanText = transcriptText.trim();
  const words = cleanText.split(/\s+/);
  const wordCount = words.length;
  
  // Try to identify the nature of the conversation
  const lowerText = cleanText.toLowerCase();
  
  // Check for common conversation types
  if (lowerText.includes('schedule') || lowerText.includes('appointment') || lowerText.includes('calendar')) {
    return `${durationMinutes}-minute conversation about scheduling and availability.`;
  }
  if (lowerText.includes('contract') || lowerText.includes('agreement') || lowerText.includes('document')) {
    return `${durationMinutes}-minute discussion about documents or agreements.`;
  }
  if (lowerText.includes('case') || lowerText.includes('matter') || lowerText.includes('client')) {
    return `${durationMinutes}-minute discussion about a case or client matter.`;
  }
  if (lowerText.includes('question') || lowerText.includes('help') || lowerText.includes('need')) {
    return `${durationMinutes}-minute consultation addressing questions and concerns.`;
  }
  if (lowerText.includes('update') || lowerText.includes('status') || lowerText.includes('progress')) {
    return `${durationMinutes}-minute status update and progress discussion.`;
  }
  if (lowerText.includes('meeting') || lowerText.includes('call') || lowerText.includes('discuss')) {
    return `${durationMinutes}-minute meeting covering various topics.`;
  }
  
  // Generic but still useful summary
  if (wordCount > 50) {
    return `${durationMinutes}-minute recorded conversation (${wordCount} words transcribed).`;
  }
  
  return `${durationMinutes}-minute recording captured for documentation.`;
}

/**
 * Extract topics from transcript text as a fallback
 */
function extractTopicsFromTranscript(transcriptText: string): string[] {
  if (!transcriptText || transcriptText.trim().length < 10) {
    return ['General discussion'];
  }
  
  const topics: string[] = [];
  const lowerText = transcriptText.toLowerCase();
  
  // Common topics in law firm contexts
  const topicPatterns = [
    { keywords: ['schedule', 'appointment', 'calendar', 'meeting', 'available'], topic: 'Scheduling' },
    { keywords: ['contract', 'agreement', 'sign', 'document'], topic: 'Documents' },
    { keywords: ['case', 'matter', 'lawsuit', 'litigation'], topic: 'Case Discussion' },
    { keywords: ['client', 'consultation', 'advice'], topic: 'Client Consultation' },
    { keywords: ['deadline', 'due', 'filing', 'court'], topic: 'Deadlines' },
    { keywords: ['payment', 'invoice', 'billing', 'fee', 'cost'], topic: 'Billing' },
    { keywords: ['update', 'status', 'progress', 'report'], topic: 'Status Update' },
    { keywords: ['question', 'concern', 'issue', 'problem'], topic: 'Questions & Concerns' },
    { keywords: ['plan', 'strategy', 'next steps', 'action'], topic: 'Planning' },
    { keywords: ['review', 'analyze', 'look at', 'examine'], topic: 'Review' },
  ];
  
  for (const pattern of topicPatterns) {
    if (pattern.keywords.some(keyword => lowerText.includes(keyword))) {
      topics.push(pattern.topic);
    }
    if (topics.length >= 3) break; // Limit to 3 topics
  }
  
  if (topics.length === 0) {
    topics.push('General discussion');
  }
  
  return topics;
}

/**
 * Generate a complete fallback AI output when generation fails entirely
 */
function generateCompleteFallback(
  transcriptText: string, 
  durationSeconds: number, 
  attributedSegments: AttributedSegment[]
): {
  meeting_overview: {
    one_sentence_summary: string;
    participants: { label: 'LAWYER' | 'CLIENT' | 'OTHER' | 'UNKNOWN'; name: string | null }[];
    topics: string[];
  };
  key_facts_stated: any[];
  legal_issues_discussed: any[];
  decisions_made: any[];
  risks_or_concerns_raised: any[];
  follow_up_actions: any[];
  open_questions: any[];
  tasks: any[];
} {
  // Extract participants from attributed segments
  const participantLabels = [...new Set(attributedSegments.map(s => s.speaker_label))];
  const participants = participantLabels.map(label => ({
    label: label as 'LAWYER' | 'CLIENT' | 'OTHER' | 'UNKNOWN',
    name: attributedSegments.find(s => s.speaker_label === label)?.speaker_name || null,
  }));
  
  // Generate smart summary
  const summary = generateSmartFallbackSummary(transcriptText, durationSeconds);
  
  // Extract topics
  const topics = extractTopicsFromTranscript(transcriptText);
  
  // Try to extract any key facts from the transcript
  const keyFacts: any[] = [];
  if (transcriptText && transcriptText.length > 50) {
    // Look for dates
    const dateMatch = transcriptText.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i);
    if (dateMatch) {
      keyFacts.push({
        fact: `Date mentioned: ${dateMatch[0]}`,
        stated_by: 'UNKNOWN' as const,
        support: [],
        certainty: 'unclear' as const,
      });
    }
    
    // Look for names (capitalized words)
    const nameMatch = transcriptText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g);
    if (nameMatch && nameMatch.length > 0) {
      const uniqueNames = [...new Set(nameMatch)].filter(n => n.length > 2).slice(0, 3);
      if (uniqueNames.length > 0) {
        keyFacts.push({
          fact: `Names mentioned: ${uniqueNames.join(', ')}`,
          stated_by: 'UNKNOWN' as const,
          support: [],
          certainty: 'unclear' as const,
        });
      }
    }
  }
  
  return {
    meeting_overview: {
      one_sentence_summary: summary,
      participants: participants.length > 0 ? participants : [{ label: 'UNKNOWN' as const, name: null }],
      topics,
    },
    key_facts_stated: keyFacts,
    legal_issues_discussed: [],
    decisions_made: [],
    risks_or_concerns_raised: [],
    follow_up_actions: [],
    open_questions: [],
    tasks: [],
  };
}

export async function processMeeting(
  meetingId: string,
  audioPath: string,
  onProgress: (progress: ProcessingProgress) => void
): Promise<boolean> {
  console.log('[MeetingProcessor] Starting processing for meeting:', meetingId);
  
  try {
    // Get meeting details including duration
    const { data: meetingData, error: meetingError } = await supabase
      .from('meetings')
      .select('duration_seconds, user_id')
      .eq('id', meetingId)
      .single();

    if (meetingError) {
      console.error('[MeetingProcessor] Failed to fetch meeting:', meetingError);
    }

    const durationSeconds = meetingData?.duration_seconds || 60; // Default to 60 seconds if not set
    console.log('[MeetingProcessor] Meeting duration:', durationSeconds, 'seconds');

    // Step 1: Download audio from Supabase storage
    onProgress({ step: 'transcribing' });
    console.log('[MeetingProcessor] Downloading audio from:', audioPath);
    
    const { data: audioData, error: downloadError } = await supabase.storage
      .from('meeting-audio')
      .download(audioPath);
    
    if (downloadError || !audioData) {
      console.error('[MeetingProcessor] Failed to download audio:', downloadError);
      throw new Error('Failed to download audio file');
    }
    
    console.log('[MeetingProcessor] Audio downloaded, size:', audioData.size);
    
    // Step 2: Transcribe audio using STT API
    console.log('[MeetingProcessor] Sending to STT API...');
    
    const formData = new FormData();
    formData.append('audio', audioData, 'audio.m4a');
    
    const sttResponse = await fetch(STT_API_URL, {
      method: 'POST',
      body: formData,
    });
    
    if (!sttResponse.ok) {
      const errorText = await sttResponse.text();
      console.error('[MeetingProcessor] STT API error:', errorText);
      throw new Error(`Transcription failed: ${sttResponse.status}`);
    }
    
    const sttResult = await sttResponse.json();
    
    // Log full STT response to investigate available data (segments, timestamps, etc.)
    console.log('[MeetingProcessor] Full STT Response:', JSON.stringify(sttResult, null, 2));
    console.log('[MeetingProcessor] STT Response keys:', Object.keys(sttResult));
    
    const transcriptText = sttResult.text || '';
    console.log('[MeetingProcessor] Transcription complete, length:', transcriptText.length);
    
    if (!transcriptText || transcriptText.trim().length === 0) {
      console.warn('[MeetingProcessor] Empty transcription, using placeholder');
    }
    
    // Step 2b: AI-powered speaker attribution
    console.log('[MeetingProcessor] Running AI speaker attribution...');
    const attributedSegments = await attributeSpeakers(transcriptText, durationSeconds);
    console.log('[MeetingProcessor] Speaker attribution complete:', attributedSegments.length, 'segments');

    // Save individual transcript segments (not just one blob)
    console.log('[MeetingProcessor] Saving', attributedSegments.length, 'transcript segments...');
    for (const segment of attributedSegments) {
      const { error: segmentError } = await supabase
        .from('transcript_segments')
        .insert({
          meeting_id: meetingId,
          speaker_label: segment.speaker_label,
          speaker_name: segment.speaker_name,
          start_ms: segment.start_ms,
          end_ms: segment.end_ms,
          text: segment.text,
          confidence: 0.85, // AI attribution confidence
        });
      
      if (segmentError) {
        console.error('[MeetingProcessor] Failed to save segment:', segmentError);
      }
    }
    console.log('[MeetingProcessor] Transcript segments saved');
    
    // Step 3: Generate AI summary with speaker-aware context
    onProgress({ step: 'summarizing' });
    console.log('[MeetingProcessor] Generating AI summary with speaker context...');
    
    // Format transcript with speaker labels for better AI analysis
    const formattedTranscript = attributedSegments
      .map(seg => {
        const speakerDisplay = seg.speaker_name 
          ? `${seg.speaker_label} (${seg.speaker_name})`
          : seg.speaker_label;
        const timeDisplay = formatTimeMs(seg.start_ms);
        return `[${timeDisplay}] ${speakerDisplay}: ${seg.text}`;
      })
      .join('\n\n');

    const summaryPrompt = `You are a Law Firm Meeting Intelligence Assistant. Your job is to comprehensively document and summarize ANY meeting or conversation recorded at a law firm.

=== TRANSCRIPT ===
${formattedTranscript || 'No transcript available.'}

=== MEETING DURATION ===
${durationSeconds} seconds (${Math.round(durationSeconds / 60)} minutes)

=== YOUR ROLE ===
You help lawyers and paralegals by creating useful summaries of their meetings. This could be:
- Client consultations about legal matters
- Internal team discussions
- Phone calls with clients or opposing counsel
- Administrative planning meetings
- Casual check-ins or status updates
- ANY conversation worth documenting

=== CRITICAL RULES - FOLLOW THESE EXACTLY ===

1. **ALWAYS PROVIDE A MEANINGFUL SUMMARY**
   - Never say "no content discussed" or "no legal matters"
   - Even if the content seems trivial, summarize what WAS said
   - Example: "Brief check-in call discussing scheduling and availability"

2. **DOCUMENT EVERYTHING DISCUSSED**
   - Legal topics, case updates, deadlines
   - Administrative matters, scheduling, logistics
   - Personal updates, relationship building
   - Questions asked, even if unanswered
   - ANY information that might be useful later

3. **EXTRACT ALL FACTS AND INFORMATION**
   - Names, dates, amounts, locations mentioned
   - Decisions made (even small ones)
   - Commitments or promises made
   - Concerns or worries expressed

4. **IDENTIFY ACTION ITEMS BROADLY**
   - Things someone said they would do
   - Things that need to happen next
   - Follow-ups mentioned
   - Deadlines or timeframes discussed

=== OUTPUT INSTRUCTIONS ===

1. ONE-SENTENCE SUMMARY: Write a clear, informative summary of the meeting's main purpose or outcome. Make it specific to what was discussed.

2. PARTICIPANTS: List who was in the meeting with their roles.

3. TOPICS: List 2-5 main topics or themes discussed.

4. KEY FACTS: Extract important information mentioned:
   - Dates, deadlines, appointments
   - Names of people, places, cases
   - Numbers, amounts, quantities
   - Specific details that might be referenced later

5. LEGAL ISSUES (if any): Note any legal topics, but don't force this - leave empty if none discussed.

6. DECISIONS: What was agreed upon or decided?

7. RISKS/CONCERNS: What worries or problems were mentioned?

8. FOLLOW-UP ACTIONS: What needs to happen next? Who is responsible?

9. OPEN QUESTIONS: What remains unresolved or needs clarification?

10. TASKS: Create specific, actionable tasks from the discussion:
    - "Schedule follow-up call with [name]"
    - "Send documents to client"
    - "Review contract by [date]"
    - "Follow up on [topic]"

=== HANDLING POOR AUDIO/SHORT RECORDINGS ===
If the transcript is unclear, short, or fragmentary:
- Summarize what you CAN understand
- Note that audio quality was limited
- Still extract any useful information present
- Use "Brief recording" or "Partial conversation" as context`;

    let aiOutput;
    try {
      aiOutput = await generateObject({
        messages: [{ role: 'user', content: summaryPrompt }],
        schema: AIOutputSchema,
      });
      console.log('[MeetingProcessor] AI summary generated');
      console.log('[MeetingProcessor] Tasks extracted:', aiOutput.tasks?.length || 0);
      console.log('[MeetingProcessor] Participants identified:', aiOutput.meeting_overview.participants.length);
      
      // Validate that we got a meaningful summary - if not, enhance it
      if (!aiOutput.meeting_overview.one_sentence_summary || 
          aiOutput.meeting_overview.one_sentence_summary.toLowerCase().includes('no legal') ||
          aiOutput.meeting_overview.one_sentence_summary.toLowerCase().includes('no content') ||
          aiOutput.meeting_overview.one_sentence_summary.length < 20) {
        console.log('[MeetingProcessor] AI returned weak summary, enhancing...');
        aiOutput.meeting_overview.one_sentence_summary = generateSmartFallbackSummary(transcriptText, durationSeconds);
      }
      
      // Ensure we have at least one topic
      if (!aiOutput.meeting_overview.topics || aiOutput.meeting_overview.topics.length === 0) {
        aiOutput.meeting_overview.topics = extractTopicsFromTranscript(transcriptText);
      }
      
    } catch (aiError) {
      console.error('[MeetingProcessor] AI generation error:', aiError);
      // Use enhanced fallback summary with speaker info from attribution
      aiOutput = generateCompleteFallback(transcriptText, durationSeconds, attributedSegments);
    }
    
    // Step 4: Extract actions (part of AI output)
    onProgress({ step: 'actions' });
    console.log('[MeetingProcessor] Processing follow-up actions and tasks...');
    
    // Save AI output to database
    const { error: aiSaveError } = await supabase
      .from('ai_outputs')
      .upsert({
        meeting_id: meetingId,
        provider: 'rork-toolkit',
        model: 'gpt-4o',
        meeting_overview: aiOutput.meeting_overview,
        key_facts_stated: aiOutput.key_facts_stated,
        legal_issues_discussed: aiOutput.legal_issues_discussed,
        decisions_made: aiOutput.decisions_made,
        risks_or_concerns_raised: aiOutput.risks_or_concerns_raised,
        follow_up_actions: aiOutput.follow_up_actions,
        open_questions: aiOutput.open_questions,
        disclaimer: 'This summary is AI-generated for documentation support and may contain errors. It is not legal advice.',
      }, {
        onConflict: 'meeting_id',
      });
    
    if (aiSaveError) {
      console.error('[MeetingProcessor] Failed to save AI output:', aiSaveError);
    }

    // Save generated tasks to database
    if (aiOutput.tasks && aiOutput.tasks.length > 0) {
      console.log('[MeetingProcessor] Saving', aiOutput.tasks.length, 'AI-generated tasks');

      if (meetingData?.user_id) {
        const tasksToInsert = aiOutput.tasks.map((task) => {
          // Determine owner string based on role and name
          let ownerString = task.owner || null;
          if (!ownerString && task.owner_role && task.owner_role !== 'UNKNOWN') {
            ownerString = task.owner_role; // Use role as owner if no specific name
          }
          
          return {
            meeting_id: meetingId,
            user_id: meetingData.user_id,
            title: task.title,
            description: task.description || null,
            priority: task.priority || 'medium',
            owner: ownerString,
            reminder_time: task.suggested_reminder || null,
            completed: false,
          };
        });

        const { error: tasksError } = await supabase
          .from('meeting_tasks')
          .insert(tasksToInsert);

        if (tasksError) {
          console.error('[MeetingProcessor] Failed to save tasks:', tasksError);
        } else {
          console.log('[MeetingProcessor] Tasks saved successfully:', tasksToInsert.map(t => t.title));
        }
      } else {
        console.warn('[MeetingProcessor] No user_id found, cannot save tasks');
      }
    } else {
      console.log('[MeetingProcessor] No tasks extracted from meeting');
    }
    
    // Step 5: Update search index
    onProgress({ step: 'indexing' });
    console.log('[MeetingProcessor] Updating search index...');
    
    // Build searchable text with speaker information
    const segmentTexts = attributedSegments.map(s => `${s.speaker_label}: ${s.text}`).join(' ');
    const searchableText = [
      aiOutput.meeting_overview.one_sentence_summary,
      aiOutput.meeting_overview.topics.join(' '),
      aiOutput.meeting_overview.participants.map(p => p.name).filter(Boolean).join(' '),
      segmentTexts,
    ].filter(Boolean).join(' ');
    
    // Try to update search index manually (may fail due to RLS, which is okay - trigger handles it)
    try {
      await supabase
        .from('meeting_search_index')
        .upsert({
          meeting_id: meetingId,
          searchable_text: searchableText,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'meeting_id',
        });
    } catch {
      console.log('[MeetingProcessor] Search index update handled by trigger');
    }
    
    // Step 6: Mark meeting as ready
    const { error: updateError } = await supabase
      .from('meetings')
      .update({ 
        status: 'ready',
        error_message: null,
      })
      .eq('id', meetingId);
    
    if (updateError) {
      console.error('[MeetingProcessor] Failed to update meeting status:', updateError);
      throw new Error('Failed to update meeting status');
    }
    
    // Update job status
    await supabase
      .from('meeting_jobs')
      .update({ status: 'completed' })
      .eq('meeting_id', meetingId);
    
    onProgress({ step: 'complete' });
    console.log('[MeetingProcessor] Processing complete for meeting:', meetingId);
    
    return true;
  } catch (error) {
    console.error('[MeetingProcessor] Processing failed:', error);
    
    // Update meeting with error
    await supabase
      .from('meetings')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Processing failed',
      })
      .eq('id', meetingId);
    
    // Update job status
    await supabase
      .from('meeting_jobs')
      .update({ 
        status: 'failed',
        last_error: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('meeting_id', meetingId);
    
    onProgress({ 
      step: 'transcribing', 
      error: error instanceof Error ? error.message : 'Processing failed' 
    });
    
    return false;
  }
}
