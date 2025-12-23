/**
 * AssemblyAI Real-Time Streaming Client
 * 
 * This module provides a WebSocket client for AssemblyAI's real-time
 * transcription API with speaker diarization support.
 * 
 * API Documentation: https://www.assemblyai.com/docs/speech-to-text/streaming
 */

import { supabase } from "./supabase";

// AssemblyAI Streaming API configuration
const ASSEMBLYAI_REALTIME_URL = "wss://api.assemblyai.com/v2/realtime/ws";
const SAMPLE_RATE = 16000;

// Message types from AssemblyAI
export interface AssemblyAIWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string;
}

export interface AssemblyAITranscriptMessage {
  message_type: "PartialTranscript" | "FinalTranscript";
  audio_start: number;
  audio_end: number;
  confidence: number;
  text: string;
  words: AssemblyAIWord[];
  created: string;
}

export interface AssemblyAISessionBegins {
  message_type: "SessionBegins";
  session_id: string;
  expires_at: string;
}

export interface AssemblyAISessionTerminated {
  message_type: "SessionTerminated";
}

export interface AssemblyAIError {
  error: string;
}

export type AssemblyAIMessage =
  | AssemblyAITranscriptMessage
  | AssemblyAISessionBegins
  | AssemblyAISessionTerminated
  | AssemblyAIError;

// Event handlers
export interface StreamingEventHandlers {
  onSessionStart?: (sessionId: string) => void;
  onPartialTranscript?: (message: AssemblyAITranscriptMessage) => void;
  onFinalTranscript?: (message: AssemblyAITranscriptMessage) => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

/**
 * AssemblyAI Streaming Client
 * 
 * Manages WebSocket connection to AssemblyAI's real-time transcription API
 */
export class AssemblyAIStreamingClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private handlers: StreamingEventHandlers;
  private isConnecting: boolean = false;
  private apiKey: string | null = null;

  constructor(handlers: StreamingEventHandlers = {}) {
    this.handlers = handlers;
  }

  /**
   * Get API key from Supabase Edge Function
   */
  private async getApiKey(): Promise<string> {
    if (this.apiKey) return this.apiKey;

    try {
      console.log("[AssemblyAI] Fetching API key from Edge Function...");
      const { data, error } = await supabase.functions.invoke("get-assemblyai-token");

      if (error) {
        throw new Error(`Failed to get API key: ${error.message}`);
      }

      if (!data?.token) {
        throw new Error("No token returned from Edge Function");
      }

      this.apiKey = data.token;
      return this.apiKey as string;
    } catch (err) {
      console.error("[AssemblyAI] Error getting API key:", err);
      throw err;
    }
  }

  /**
   * Connect to AssemblyAI real-time WebSocket
   */
  async connect(): Promise<void> {
    if (this.ws || this.isConnecting) {
      console.log("[AssemblyAI] Already connected or connecting");
      return;
    }

    this.isConnecting = true;

    try {
      const apiKey = await this.getApiKey();
      
      const url = `${ASSEMBLYAI_REALTIME_URL}?sample_rate=${SAMPLE_RATE}`;
      console.log("[AssemblyAI] Connecting to:", url);

      this.ws = new WebSocket(url);

      // Set up authentication on open
      this.ws.onopen = () => {
        console.log("[AssemblyAI] WebSocket opened, authenticating...");
        this.ws?.send(JSON.stringify({ token: apiKey }));
      };

      // Handle incoming messages
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as AssemblyAIMessage;
          this.handleMessage(message);
        } catch (err) {
          console.error("[AssemblyAI] Error parsing message:", err);
        }
      };

      // Handle errors
      this.ws.onerror = (error) => {
        console.error("[AssemblyAI] WebSocket error:", error);
        this.handlers.onError?.("WebSocket connection error");
      };

      // Handle close
      this.ws.onclose = (event) => {
        console.log("[AssemblyAI] WebSocket closed:", event.code, event.reason);
        this.ws = null;
        this.sessionId = null;
        this.isConnecting = false;
        this.handlers.onClose?.();
      };

      // Wait for connection to be established
      await this.waitForConnection();
      this.isConnecting = false;
      console.log("[AssemblyAI] Connected successfully");
    } catch (err) {
      this.isConnecting = false;
      console.error("[AssemblyAI] Connection error:", err);
      throw err;
    }
  }

  /**
   * Wait for WebSocket connection to be established
   */
  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 10000);

      const checkConnection = () => {
        if (this.sessionId) {
          clearTimeout(timeout);
          resolve();
        } else if (this.ws?.readyState === WebSocket.CLOSED) {
          clearTimeout(timeout);
          reject(new Error("Connection closed"));
        } else {
          setTimeout(checkConnection, 100);
        }
      };

      checkConnection();
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: AssemblyAIMessage): void {
    if ("error" in message) {
      console.error("[AssemblyAI] Error from server:", message.error);
      this.handlers.onError?.(message.error);
      return;
    }

    switch (message.message_type) {
      case "SessionBegins":
        console.log("[AssemblyAI] Session started:", message.session_id);
        this.sessionId = message.session_id;
        this.handlers.onSessionStart?.(message.session_id);
        break;

      case "PartialTranscript":
        if (message.text) {
          this.handlers.onPartialTranscript?.(message);
        }
        break;

      case "FinalTranscript":
        if (message.text) {
          console.log("[AssemblyAI] Final transcript:", message.text);
          this.handlers.onFinalTranscript?.(message);
        }
        break;

      case "SessionTerminated":
        console.log("[AssemblyAI] Session terminated");
        break;
    }
  }

  /**
   * Send audio data to AssemblyAI
   * 
   * @param audioData - Base64 encoded PCM audio data (16kHz, mono, 16-bit)
   */
  sendAudio(audioData: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[AssemblyAI] Cannot send audio - not connected");
      return;
    }

    this.ws.send(JSON.stringify({ audio_data: audioData }));
  }

  /**
   * Send raw audio buffer to AssemblyAI
   * 
   * @param buffer - Float32Array or Int16Array of audio samples
   */
  sendAudioBuffer(buffer: Float32Array | Int16Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Convert to base64
    let int16Buffer: Int16Array;
    
    if (buffer instanceof Float32Array) {
      // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
      int16Buffer = new Int16Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i]));
        int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
    } else {
      int16Buffer = buffer;
    }

    // Convert to base64
    const bytes = new Uint8Array(int16Buffer.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    this.sendAudio(base64);
  }

  /**
   * End the current session gracefully
   */
  endSession(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("[AssemblyAI] Ending session...");
      this.ws.send(JSON.stringify({ terminate_session: true }));
    }
  }

  /**
   * Disconnect from AssemblyAI
   */
  disconnect(): void {
    if (this.ws) {
      console.log("[AssemblyAI] Disconnecting...");
      this.endSession();
      
      // Give time for termination message, then close
      setTimeout(() => {
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
        this.sessionId = null;
      }, 500);
    }
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.sessionId !== null;
  }

  /**
   * Get current session ID
   */
  get currentSessionId(): string | null {
    return this.sessionId;
  }
}

/**
 * Create a new streaming client instance
 */
export function createStreamingClient(handlers: StreamingEventHandlers = {}): AssemblyAIStreamingClient {
  return new AssemblyAIStreamingClient(handlers);
}

