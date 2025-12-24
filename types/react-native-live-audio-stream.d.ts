/**
 * Type declarations for react-native-live-audio-stream
 * 
 * This library provides real-time audio streaming capabilities
 * for React Native applications, outputting PCM audio data.
 */

declare module "react-native-live-audio-stream" {
  export interface AudioConfig {
    /**
     * Sample rate in Hz (e.g., 16000, 44100)
     */
    sampleRate: number;
    
    /**
     * Number of audio channels (1 = mono, 2 = stereo)
     */
    channels: 1 | 2;
    
    /**
     * Bits per sample (8 or 16)
     */
    bitsPerSample: 8 | 16;
    
    /**
     * Android only: Audio source type
     * 1 = MIC
     * 6 = VOICE_RECOGNITION (optimized for speech)
     * 7 = VOICE_COMMUNICATION
     */
    audioSource?: number;
    
    /**
     * Buffer size in bytes
     */
    bufferSize?: number;
  }

  export interface LiveAudioStream {
    /**
     * Initialize the audio stream with configuration
     */
    init(config: AudioConfig): void;
    
    /**
     * Start capturing audio
     */
    start(): void;
    
    /**
     * Stop capturing audio
     */
    stop(): void;
    
    /**
     * Register event listener for audio data
     * @param event Event name ("data")
     * @param callback Callback receiving base64-encoded PCM audio data
     */
    on(event: "data", callback: (data: string) => void): void;
  }

  const LiveAudioStream: LiveAudioStream;
  export default LiveAudioStream;
}

