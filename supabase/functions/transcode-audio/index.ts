// Supabase Edge Function for transcoding WebM audio to M4A
// This enables cross-platform audio playback (iOS doesn't support WebM)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TranscodeRequest {
  meetingId: string
  audioPath: string
}

interface CloudConvertJob {
  id: string
  status: string
  tasks: Array<{
    id: string
    name: string
    status: string
    result?: {
      files?: Array<{
        url: string
        filename: string
      }>
    }
  }>
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { meetingId, audioPath } = await req.json() as TranscodeRequest

    if (!meetingId || !audioPath) {
      return new Response(
        JSON.stringify({ error: 'Missing meetingId or audioPath' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Transcode] Starting transcoding for meeting: ${meetingId}`)
    console.log(`[Transcode] Audio path: ${audioPath}`)

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const cloudConvertApiKey = Deno.env.get('CLOUDCONVERT_API_KEY')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check if CloudConvert API key is configured
    if (!cloudConvertApiKey) {
      console.error('[Transcode] CloudConvert API key not configured')
      
      // Update meeting to indicate transcoding failed
      await supabase
        .from('meetings')
        .update({ audio_format: 'failed' })
        .eq('id', meetingId)
      
      return new Response(
        JSON.stringify({ error: 'Transcoding service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Download the WebM file from Supabase Storage
    console.log('[Transcode] Downloading audio file...')
    const { data: audioBlob, error: downloadError } = await supabase.storage
      .from('meeting-audio')
      .download(audioPath)

    if (downloadError || !audioBlob) {
      console.error('[Transcode] Download error:', downloadError)
      
      await supabase
        .from('meetings')
        .update({ audio_format: 'failed' })
        .eq('id', meetingId)
      
      return new Response(
        JSON.stringify({ error: 'Failed to download audio file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Transcode] Downloaded audio file, size: ${audioBlob.size} bytes`)

    // Create CloudConvert job
    console.log('[Transcode] Creating CloudConvert job...')
    
    // Step 1: Create a job with import/task, convert task, and export task
    const createJobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cloudConvertApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tasks: {
          'import-audio': {
            operation: 'import/upload',
          },
          'convert-audio': {
            operation: 'convert',
            input: 'import-audio',
            output_format: 'm4a',
            audio_codec: 'aac',
            audio_bitrate: 128,
          },
          'export-audio': {
            operation: 'export/url',
            input: 'convert-audio',
            inline: false,
            archive_multiple_files: false,
          },
        },
      }),
    })

    if (!createJobResponse.ok) {
      const errorText = await createJobResponse.text()
      console.error('[Transcode] CloudConvert job creation failed:', errorText)
      
      await supabase
        .from('meetings')
        .update({ audio_format: 'failed' })
        .eq('id', meetingId)
      
      return new Response(
        JSON.stringify({ error: 'Failed to create transcoding job' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const job = await createJobResponse.json() as { data: CloudConvertJob }
    console.log(`[Transcode] Job created: ${job.data.id}`)

    // Step 2: Find the upload task and upload the file
    const uploadTask = job.data.tasks.find(t => t.name === 'import-audio')
    if (!uploadTask) {
      throw new Error('Upload task not found in job')
    }

    // Get upload URL
    const getTaskResponse = await fetch(`https://api.cloudconvert.com/v2/tasks/${uploadTask.id}`, {
      headers: {
        'Authorization': `Bearer ${cloudConvertApiKey}`,
      },
    })
    
    const taskData = await getTaskResponse.json() as { data: { result?: { form?: { url: string, parameters: Record<string, string> } } } }
    
    if (!taskData.data.result?.form) {
      throw new Error('Upload form not ready')
    }

    // Upload the file
    console.log('[Transcode] Uploading file to CloudConvert...')
    const formData = new FormData()
    
    // Add form parameters
    for (const [key, value] of Object.entries(taskData.data.result.form.parameters)) {
      formData.append(key, value)
    }
    
    // Add the file
    formData.append('file', audioBlob, 'audio.webm')
    
    const uploadResponse = await fetch(taskData.data.result.form.url, {
      method: 'POST',
      body: formData,
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      console.error('[Transcode] Upload failed:', errorText)
      throw new Error('Failed to upload file to CloudConvert')
    }

    console.log('[Transcode] File uploaded, waiting for conversion...')

    // Step 3: Wait for the job to complete (poll status)
    let attempts = 0
    const maxAttempts = 60 // 5 minutes max wait time (5s intervals)
    let completedJob: CloudConvertJob | null = null

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
      
      const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${job.data.id}`, {
        headers: {
          'Authorization': `Bearer ${cloudConvertApiKey}`,
        },
      })
      
      const statusData = await statusResponse.json() as { data: CloudConvertJob }
      
      if (statusData.data.status === 'finished') {
        completedJob = statusData.data
        break
      } else if (statusData.data.status === 'error') {
        console.error('[Transcode] Job failed:', statusData.data)
        throw new Error('Transcoding job failed')
      }
      
      console.log(`[Transcode] Job status: ${statusData.data.status}, attempt ${attempts + 1}`)
      attempts++
    }

    if (!completedJob) {
      throw new Error('Transcoding timed out')
    }

    console.log('[Transcode] Conversion complete!')

    // Step 4: Get the exported file URL
    const exportTask = completedJob.tasks.find(t => t.name === 'export-audio')
    const exportedFileUrl = exportTask?.result?.files?.[0]?.url

    if (!exportedFileUrl) {
      throw new Error('No exported file URL found')
    }

    console.log('[Transcode] Downloading converted file...')

    // Step 5: Download the converted M4A file
    const m4aResponse = await fetch(exportedFileUrl)
    if (!m4aResponse.ok) {
      throw new Error('Failed to download converted file')
    }
    
    const m4aBlob = await m4aResponse.blob()
    console.log(`[Transcode] Downloaded M4A file, size: ${m4aBlob.size} bytes`)

    // Step 6: Upload the M4A file to Supabase Storage
    const newAudioPath = audioPath.replace(/\.webm$/i, '.m4a').replace(/\.m4a\.m4a$/, '.m4a')
    
    console.log(`[Transcode] Uploading M4A to: ${newAudioPath}`)
    
    const { error: uploadError } = await supabase.storage
      .from('meeting-audio')
      .upload(newAudioPath, m4aBlob, {
        contentType: 'audio/mp4',
        upsert: true,
      })

    if (uploadError) {
      console.error('[Transcode] Upload to storage failed:', uploadError)
      throw new Error('Failed to upload converted audio')
    }

    // Step 7: Update the meeting record
    console.log('[Transcode] Updating meeting record...')
    const { error: updateError } = await supabase
      .from('meetings')
      .update({
        audio_path: newAudioPath,
        audio_format: 'm4a',
      })
      .eq('id', meetingId)

    if (updateError) {
      console.error('[Transcode] Update meeting failed:', updateError)
      throw new Error('Failed to update meeting record')
    }

    // Step 8: Delete the original WebM file (optional, keep for now as backup)
    // Uncomment to delete:
    // await supabase.storage.from('meeting-audio').remove([audioPath])

    console.log(`[Transcode] Successfully transcoded audio for meeting: ${meetingId}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        meetingId,
        newAudioPath,
        message: 'Audio transcoded successfully' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Transcode] Error:', error)

    // Try to update the meeting status to failed
    try {
      const { meetingId } = await req.clone().json() as TranscodeRequest
      if (meetingId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        
        await supabase
          .from('meetings')
          .update({ audio_format: 'failed' })
          .eq('id', meetingId)
      }
    } catch (e) {
      console.error('[Transcode] Failed to update meeting status:', e)
    }

    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Transcoding failed',
        details: String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

