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

  const prompt = `You are an expert at analyzing legal meeting transcripts and identifying different speakers.

TRANSCRIPT:
${transcriptText}

INSTRUCTIONS:
1. Carefully analyze this transcript and split it into segments based on when the speaker changes.
2. Identify who is likely the LAWYER based on:
   - Uses legal terminology (e.g., "liability", "damages", "statute", "precedent", "jurisdiction")
   - Gives professional advice or recommendations
   - Asks diagnostic/clarifying questions about the legal matter
   - Explains legal processes or procedures
   - Uses phrases like "In my opinion", "I would advise", "From a legal standpoint"

3. Identify who is likely the CLIENT based on:
   - Describes their personal situation or problem
   - Asks questions seeking advice
   - Expresses concerns or worries
   - Provides factual details about events or circumstances
   - Uses phrases like "What happened was", "I'm worried about", "What should I do"

4. Label others as OTHER if they seem to be third parties (witnesses, other attorneys, etc.)

5. For each segment, estimate its position as a percentage (0-100) through the conversation.
   - First segment starts at 0%
   - Last segment should end near 100%
   - Distribute segments proportionally based on text length

6. If speaker names are mentioned in the conversation, include them.

IMPORTANT: 
- Create meaningful segments - don't split mid-sentence
- Each segment should contain complete thoughts from one speaker
- If you can't determine the speaker role, use UNKNOWN
- Be conservative - only assign LAWYER/CLIENT if you're reasonably confident`;

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

    const summaryPrompt = `You are a legal meeting analyst. Analyze the following meeting transcript with identified speakers.

TRANSCRIPT WITH SPEAKER LABELS:
${formattedTranscript || 'No transcript available.'}

MEETING DURATION: ${durationSeconds} seconds

INSTRUCTIONS:
1. Provide a one-sentence summary focusing on the legal matter discussed
2. Confirm or refine participant identification - verify if LAWYER/CLIENT labels are accurate based on the content
3. List the main topics discussed
4. Extract key facts - note who stated each fact
5. Identify legal issues discussed - note who raised them
6. Document decisions made
7. List risks or concerns - note who raised each concern
8. Extract follow-up actions with clear ownership (who must do what)
9. Note open questions that remain unresolved

10. **IMPORTANT - Extract actionable tasks:**
   - Create specific, concrete tasks based on what was discussed
   - For each task, provide:
     * Clear, actionable title (e.g., "Draft contract amendment", "Schedule follow-up call")
     * Brief description if needed
     * Priority (low/medium/high) based on urgency mentioned
     * Owner - who should do this task (use the actual role: LAWYER for attorney tasks, CLIENT for client tasks)
     * Suggested deadline if any timeframe was mentioned (ISO format)
   
   Examples of lawyer tasks: draft documents, file motions, research case law, schedule court dates
   Examples of client tasks: gather documents, provide information, sign paperwork, make decisions

If the transcript is empty or unclear, provide reasonable defaults indicating limited information was available.`;

    let aiOutput;
    try {
      aiOutput = await generateObject({
        messages: [{ role: 'user', content: summaryPrompt }],
        schema: AIOutputSchema,
      });
      console.log('[MeetingProcessor] AI summary generated');
      console.log('[MeetingProcessor] Tasks extracted:', aiOutput.tasks?.length || 0);
      console.log('[MeetingProcessor] Participants identified:', aiOutput.meeting_overview.participants.length);
    } catch (aiError) {
      console.error('[MeetingProcessor] AI generation error:', aiError);
      // Use fallback summary with speaker info from attribution
      const fallbackParticipants = [...new Set(attributedSegments.map(s => s.speaker_label))]
        .map(label => ({ 
          label: label as 'LAWYER' | 'CLIENT' | 'OTHER' | 'UNKNOWN', 
          name: attributedSegments.find(s => s.speaker_label === label)?.speaker_name || null 
        }));
      
      aiOutput = {
        meeting_overview: {
          one_sentence_summary: 'Meeting recording processed with limited transcript clarity.',
          participants: fallbackParticipants.length > 0 ? fallbackParticipants : [{ label: 'UNKNOWN' as const, name: null }],
          topics: ['General discussion'],
        },
        key_facts_stated: [],
        legal_issues_discussed: [],
        decisions_made: [],
        risks_or_concerns_raised: [],
        follow_up_actions: [],
        open_questions: [],
        tasks: [],
      };
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
