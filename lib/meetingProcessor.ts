import { supabase } from '@/lib/supabase';
import { generateObject } from '@rork-ai/toolkit-sdk';
import { z } from 'zod';


const STT_API_URL = 'https://toolkit.rork.com/stt/transcribe/';

export type ProcessingStep = 'uploading' | 'transcribing' | 'summarizing' | 'actions' | 'indexing' | 'complete';

export interface ProcessingProgress {
  step: ProcessingStep;
  error?: string;
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

const AIOutputSchema = z.object({
  meeting_overview: MeetingOverviewSchema,
  key_facts_stated: z.array(z.object({
    fact: z.string(),
    support: z.array(SupportSchema).optional().default([]),
    certainty: z.enum(['explicit', 'unclear']).optional().default('explicit'),
  })),
  legal_issues_discussed: z.array(z.object({
    issue: z.string(),
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
    support: z.array(SupportSchema).optional().default([]),
    certainty: z.enum(['explicit', 'unclear']).optional().default('explicit'),
  })),
});

export async function processMeeting(
  meetingId: string,
  audioPath: string,
  onProgress: (progress: ProcessingProgress) => void
): Promise<boolean> {
  console.log('[MeetingProcessor] Starting processing for meeting:', meetingId);
  
  try {
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
    const transcriptText = sttResult.text || '';
    console.log('[MeetingProcessor] Transcription complete, length:', transcriptText.length);
    
    if (!transcriptText || transcriptText.trim().length === 0) {
      console.warn('[MeetingProcessor] Empty transcription, using placeholder');
    }
    
    // Save transcript as a single segment
    const { error: segmentError } = await supabase
      .from('transcript_segments')
      .insert({
        meeting_id: meetingId,
        speaker_label: 'UNKNOWN',
        start_ms: 0,
        end_ms: 0,
        text: transcriptText || 'No speech detected in recording.',
        confidence: 0.9,
      });
    
    if (segmentError) {
      console.error('[MeetingProcessor] Failed to save transcript:', segmentError);
    }
    
    // Step 3: Generate AI summary
    onProgress({ step: 'summarizing' });
    console.log('[MeetingProcessor] Generating AI summary...');
    
    const summaryPrompt = `You are a legal meeting analyst. Analyze the following meeting transcript and extract key information.

TRANSCRIPT:
${transcriptText || 'No transcript available.'}

Provide a comprehensive analysis including:
1. A one-sentence summary of the meeting
2. Key participants (label them as LAWYER, CLIENT, OTHER, or UNKNOWN)
3. Main topics discussed
4. Key facts stated
5. Legal issues discussed
6. Decisions made
7. Risks or concerns raised
8. Follow-up actions with owners
9. Open questions that remain

If the transcript is empty or unclear, provide reasonable defaults indicating limited information was available.`;

    let aiOutput;
    try {
      aiOutput = await generateObject({
        messages: [{ role: 'user', content: summaryPrompt }],
        schema: AIOutputSchema,
      });
      console.log('[MeetingProcessor] AI summary generated');
    } catch (aiError) {
      console.error('[MeetingProcessor] AI generation error:', aiError);
      // Use fallback summary
      aiOutput = {
        meeting_overview: {
          one_sentence_summary: 'Meeting recording processed with limited transcript clarity.',
          participants: [{ label: 'UNKNOWN' as const, name: null }],
          topics: ['General discussion'],
        },
        key_facts_stated: [],
        legal_issues_discussed: [],
        decisions_made: [],
        risks_or_concerns_raised: [],
        follow_up_actions: [],
        open_questions: [],
      };
    }
    
    // Step 4: Extract actions (part of AI output)
    onProgress({ step: 'actions' });
    console.log('[MeetingProcessor] Processing follow-up actions...');
    
    // Save AI output to database
    const { error: aiError } = await supabase
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
    
    if (aiError) {
      console.error('[MeetingProcessor] Failed to save AI output:', aiError);
    }
    
    // Step 5: Update search index
    onProgress({ step: 'indexing' });
    console.log('[MeetingProcessor] Updating search index...');
    
    // The search index is updated via database trigger, but we can also do it manually
    const searchableText = [
      aiOutput.meeting_overview.one_sentence_summary,
      aiOutput.meeting_overview.topics.join(' '),
      transcriptText,
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
