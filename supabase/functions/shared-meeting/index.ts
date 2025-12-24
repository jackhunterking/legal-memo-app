/**
 * Shared Meeting Edge Function
 * 
 * Returns meeting data as JSON for the sharing page to render.
 * The actual HTML rendering happens client-side via a hosted viewer page.
 * 
 * IMPORTANT: Supabase Edge Functions rewrite text/html to text/plain by design.
 * This function returns JSON data that a client-side viewer renders.
 * 
 * Endpoints:
 * - GET ?token=xxx - Returns meeting data as JSON
 * - GET ?token=xxx&mode=embed - Returns embeddable HTML (base64 encoded in JSON)
 * - POST ?token=xxx - Validate password, returns meeting data as JSON
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { crypto } from 'https://deno.land/std@0.208.0/crypto/mod.ts';
import { encodeHex } from 'https://deno.land/std@0.208.0/encoding/hex.ts';

// Types
interface MeetingShare {
  id: string;
  meeting_id: string;
  share_token: string;
  password_hash: string | null;
  is_active: boolean;
  view_count: number;
  last_viewed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface Meeting {
  id: string;
  title: string;
  status: string;
  duration_seconds: number;
  recorded_at: string | null;
  created_at: string;
  mp3_audio_path: string | null;
  raw_audio_path: string | null;
}

interface Transcript {
  id: string;
  meeting_id: string;
  full_text: string | null;
  summary: string | null;
}

interface TranscriptSegment {
  id: string;
  meeting_id: string;
  speaker: string;
  text: string;
  start_ms: number;
  end_ms: number;
  confidence: number | null;
}

interface MeetingType {
  id: string;
  name: string;
  color: string;
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
}

// CORS headers for JSON responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// JSON response helper
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

// Error response helper
function errorResponse(code: string, message: string, status = 400): Response {
  return jsonResponse({ error: code, message }, status);
}

// Debug log
console.info('shared-meeting function started - v12 JSON API');

// Main handler
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Create Supabase client with service role for full access
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const mode = url.searchParams.get('mode'); // 'embed' for base64 HTML

    // No token provided
    if (!token) {
      return errorResponse('INVALID_TOKEN', 'No share token provided. Please check the link and try again.');
    }

    // Fetch the share record
    const { data: share, error: shareError } = await supabase
      .from('meeting_shares')
      .select('*')
      .eq('share_token', token)
      .single();

    // Share not found
    if (shareError || !share) {
      return errorResponse('NOT_FOUND', 'This share link does not exist or has been removed.', 404);
    }

    const shareData = share as MeetingShare;

    // Check if share is active
    if (!shareData.is_active) {
      return errorResponse('DEACTIVATED', 'This share link has been deactivated by the owner.', 403);
    }

    // Check expiration
    if (shareData.expires_at && new Date(shareData.expires_at) < new Date()) {
      return errorResponse('EXPIRED', 'This share link has expired.', 403);
    }

    // Handle password protection
    if (shareData.password_hash) {
      // For GET requests, indicate password is required
      if (req.method === 'GET') {
        return jsonResponse({
          requiresPassword: true,
          token: token,
        });
      }

      // For POST requests, validate password
      if (req.method === 'POST') {
        let password: string | null = null;
        
        const contentType = req.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const body = await req.json();
          password = body.password;
        } else if (contentType.includes('form')) {
          const formData = await req.formData();
          password = formData.get('password') as string;
        }

        if (!password) {
          return errorResponse('PASSWORD_REQUIRED', 'Please enter a password.', 400);
        }

        // Verify password using SHA-256 with salt (format: "salt:hash")
        const [salt, storedHash] = shareData.password_hash.split(':');
        const encoder = new TextEncoder();
        const data = encoder.encode(salt + password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const computedHash = encodeHex(new Uint8Array(hashBuffer));
        const isValid = computedHash === storedHash;

        if (!isValid) {
          return errorResponse('INVALID_PASSWORD', 'Incorrect password. Please try again.', 401);
        }

        // Password correct, continue to return meeting data
      }
    }

    // Fetch meeting data
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, title, status, duration_seconds, recorded_at, created_at, mp3_audio_path, raw_audio_path, meeting_type_id, contact_id')
      .eq('id', shareData.meeting_id)
      .single();

    // Meeting not found
    if (meetingError || !meeting) {
      return errorResponse('MEETING_NOT_FOUND', 'The meeting associated with this link no longer exists.', 404);
    }

    const meetingData = meeting as Meeting & { meeting_type_id: string | null; contact_id: string | null };

    // Fetch transcript
    const { data: transcript } = await supabase
      .from('transcripts')
      .select('id, meeting_id, full_text, summary')
      .eq('meeting_id', meetingData.id)
      .single();

    // Fetch transcript segments
    const { data: segments } = await supabase
      .from('transcript_segments')
      .select('id, meeting_id, speaker, text, start_ms, end_ms, confidence')
      .eq('meeting_id', meetingData.id)
      .order('start_ms', { ascending: true });

    // Fetch meeting type if exists
    let meetingType: MeetingType | null = null;
    if (meetingData.meeting_type_id) {
      const { data: typeData } = await supabase
        .from('meeting_types')
        .select('id, name, color')
        .eq('id', meetingData.meeting_type_id)
        .single();
      meetingType = typeData as MeetingType | null;
    }

    // Fetch contact if exists
    let contact: Contact | null = null;
    if (meetingData.contact_id) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('id, first_name, last_name')
        .eq('id', meetingData.contact_id)
        .single();
      contact = contactData as Contact | null;
    }

    // Generate signed URL for audio (1 hour expiration)
    let audioUrl: string | null = null;
    const audioPath = meetingData.mp3_audio_path || meetingData.raw_audio_path;
    if (audioPath) {
      const { data: signedData } = await supabase.storage
        .from('meeting-audio')
        .createSignedUrl(audioPath, 3600); // 1 hour
      audioUrl = signedData?.signedUrl || null;
    }

    // Increment view count
    await supabase.rpc('increment_share_view_count', { p_share_token: token });

    // Return meeting data as JSON
    const responseData = {
      success: true,
      meeting: {
        id: meetingData.id,
        title: meetingData.title,
        status: meetingData.status,
        durationSeconds: meetingData.duration_seconds,
        recordedAt: meetingData.recorded_at,
        createdAt: meetingData.created_at,
      },
      transcript: transcript ? {
        fullText: (transcript as Transcript).full_text,
        summary: (transcript as Transcript).summary,
      } : null,
      segments: ((segments as TranscriptSegment[]) || []).map(seg => ({
        speaker: seg.speaker,
        text: seg.text,
        startMs: seg.start_ms,
        endMs: seg.end_ms,
      })),
      meetingType: meetingType ? {
        name: meetingType.name,
        color: meetingType.color,
      } : null,
      contact: contact ? {
        firstName: contact.first_name,
        lastName: contact.last_name,
      } : null,
      audioUrl,
      viewCount: shareData.view_count + 1,
    };

    // If mode=embed, also include base64 encoded HTML for iframe embedding
    if (mode === 'embed') {
      const html = generateEmbedHtml(responseData);
      const base64Html = btoa(unescape(encodeURIComponent(html)));
      return jsonResponse({
        ...responseData,
        embedHtml: base64Html,
      });
    }

    return jsonResponse(responseData);

  } catch (error) {
    console.error('[shared-meeting] Error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred. Please try again later.', 500);
  }
});

/**
 * Generate embeddable HTML for the meeting
 */
function generateEmbedHtml(data: {
  meeting: { title: string; durationSeconds: number; recordedAt: string | null; createdAt: string };
  transcript: { fullText: string | null; summary: string | null } | null;
  segments: { speaker: string; text: string; startMs: number }[];
  meetingType: { name: string; color: string } | null;
  contact: { firstName: string; lastName: string | null } | null;
  audioUrl: string | null;
}): string {
  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTimestamp = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const getSpeakerColor = (speaker: string): string => {
    const s = speaker.toUpperCase();
    if (s.endsWith('A')) return '#3b82f6';
    if (s.endsWith('B')) return '#ef4444';
    if (s.endsWith('C')) return '#8b5cf6';
    if (s.endsWith('D')) return '#10b981';
    return '#f59e0b';
  };

  const transcriptHtml = data.segments.length > 0
    ? data.segments.map(seg => `
      <div style="display:flex;background:#252b3d;border-radius:12px;overflow:hidden;margin-bottom:12px;">
        <div style="width:5px;background:${getSpeakerColor(seg.speaker)};"></div>
        <div style="padding:16px;flex:1;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:${getSpeakerColor(seg.speaker)};margin-bottom:8px;">${escapeHtml(seg.speaker)}</div>
          <div style="font-size:15px;color:#e5e7eb;line-height:1.6;margin-bottom:8px;">${escapeHtml(seg.text)}</div>
          <div style="font-size:11px;color:#6b7280;">${formatTimestamp(seg.startMs)}</div>
        </div>
      </div>
    `).join('')
    : data.transcript?.fullText
      ? `<p style="font-size:15px;color:#d1d5db;line-height:1.7;white-space:pre-wrap;">${escapeHtml(data.transcript.fullText)}</p>`
      : '<p style="color:#6b7280;font-style:italic;text-align:center;padding:32px;">No transcript available</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.meeting.title)} - Shared Meeting</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#0f1219;color:#e5e7eb;line-height:1.6;padding:24px;}
  </style>
</head>
<body>
  <div style="max-width:800px;margin:0 auto;">
    <h1 style="font-size:28px;font-weight:700;color:#fff;margin-bottom:16px;">${escapeHtml(data.meeting.title)}</h1>
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;margin-bottom:32px;">
      <span style="background:rgba(99,102,241,0.15);color:#818cf8;padding:6px 12px;border-radius:20px;font-weight:600;font-size:14px;">${formatDuration(data.meeting.durationSeconds)}</span>
      <span style="color:#9ca3af;font-size:14px;">${formatDate(data.meeting.recordedAt || data.meeting.createdAt)}</span>
      ${data.meetingType ? `<span style="background:${data.meetingType.color}20;color:${data.meetingType.color};padding:6px 12px;border-radius:8px;font-size:13px;font-weight:600;">${escapeHtml(data.meetingType.name)}</span>` : ''}
    </div>
    ${data.contact ? `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #2d3548;">
        <div style="width:36px;height:36px;border-radius:50%;background:#6366f1;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;">${escapeHtml((data.contact.firstName[0] || '') + (data.contact.lastName?.[0] || ''))}</div>
        <span style="font-size:14px;color:#fff;font-weight:500;">${escapeHtml(data.contact.firstName)}${data.contact.lastName ? ' ' + escapeHtml(data.contact.lastName) : ''}</span>
      </div>
    ` : ''}
    ${data.audioUrl ? `
      <div style="background:#1e2433;border-radius:16px;padding:20px;margin-bottom:24px;border:1px solid #2d3548;">
        <h2 style="font-size:18px;font-weight:600;color:#fff;margin-bottom:16px;">Audio Recording</h2>
        <audio controls style="width:100%;" src="${escapeHtml(data.audioUrl)}"></audio>
      </div>
    ` : ''}
    ${data.transcript?.summary ? `
      <div style="background:#1e2433;border-radius:16px;padding:24px;margin-bottom:24px;border:1px solid #2d3548;">
        <h2 style="font-size:18px;font-weight:600;color:#fff;margin-bottom:16px;">Summary</h2>
        <p style="font-size:16px;color:#d1d5db;line-height:1.7;">${escapeHtml(data.transcript.summary)}</p>
      </div>
    ` : ''}
    <div style="background:#1e2433;border-radius:16px;padding:24px;border:1px solid #2d3548;">
      <h2 style="font-size:18px;font-weight:600;color:#fff;margin-bottom:16px;">Transcript</h2>
      ${transcriptHtml}
    </div>
    <footer style="text-align:center;padding:24px;color:#6b7280;font-size:13px;margin-top:48px;border-top:1px solid #2d3548;">
      Shared via <strong style="color:#6366f1;">Legal Memo</strong>
    </footer>
  </div>
</body>
</html>`;
}
