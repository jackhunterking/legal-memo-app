/**
 * LiveTranscript Component
 * 
 * Displays real-time transcription with speaker diarization.
 * 
 * Per AssemblyAI Streaming API v3:
 * - PartialTranscript: Interim results (shown with pulsing animation, may change)
 * - FinalTranscript: Immutable final results (shown permanently with speaker badge)
 * 
 * Features:
 * - Speaker color coding for visual differentiation
 * - Auto-scroll to bottom as new content arrives
 * - Timestamp display using audio_start from AssemblyAI
 * - "Listening..." state when connected but no speech detected
 */

import React, { useRef, useEffect, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
} from "react-native";
import { Users, MessageCircle, Mic, Volume2 } from "lucide-react-native";
import Colors from "@/constants/colors";
import type { TranscriptTurn } from "@/hooks/useStreamingTranscription";

/**
 * Speaker colors for visual differentiation
 * Consistent across the app for recognizing speakers
 */
const SPEAKER_COLORS: Record<string, string> = {
  "Speaker A": "#3B82F6", // Blue
  "Speaker B": "#10B981", // Green
  "Speaker C": "#F59E0B", // Amber
  "Speaker D": "#8B5CF6", // Purple
  "Speaker E": "#EC4899", // Pink
  "Speaker F": "#06B6D4", // Cyan
  "speaker_0": "#3B82F6", // AssemblyAI format
  "speaker_1": "#10B981",
  "speaker_2": "#F59E0B",
  "speaker_3": "#8B5CF6",
};

/**
 * Get speaker color or generate a consistent one
 */
const getSpeakerColor = (speaker: string): string => {
  if (SPEAKER_COLORS[speaker]) {
    return SPEAKER_COLORS[speaker];
  }
  // Generate a consistent color based on speaker name hash
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 50%)`;
};

/**
 * Format timestamp from milliseconds to MM:SS
 * Uses audio_start/audio_end from AssemblyAI
 */
const formatTimestamp = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

/**
 * Format speaker name for display
 * Converts AssemblyAI format (speaker_0) to friendly format (Speaker A)
 */
const formatSpeakerName = (speaker: string): string => {
  // Handle AssemblyAI format (speaker_0, speaker_1, etc.)
  const match = speaker.match(/^speaker_(\d+)$/i);
  if (match) {
    const index = parseInt(match[1], 10);
    const letter = String.fromCharCode(65 + (index % 26)); // A, B, C, ...
    return `Speaker ${letter}`;
  }
  return speaker;
};

/**
 * Individual transcript turn item (FinalTranscript)
 */
interface TranscriptTurnItemProps {
  turn: TranscriptTurn;
  isNew?: boolean;
}

const TranscriptTurnItem: React.FC<TranscriptTurnItemProps> = memo(({ turn, isNew }) => {
  const fadeAnim = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(isNew ? 10 : 0)).current;
  const displayName = formatSpeakerName(turn.speaker);
  const speakerColor = getSpeakerColor(turn.speaker);

  useEffect(() => {
    if (isNew) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isNew, fadeAnim, slideAnim]);

  return (
    <Animated.View
      style={[
        styles.turnContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.turnHeader}>
        <View style={[styles.speakerBadge, { backgroundColor: speakerColor + "20" }]}>
          <View style={[styles.speakerDot, { backgroundColor: speakerColor }]} />
          <Text style={[styles.speakerName, { color: speakerColor }]}>
            {displayName}
          </Text>
        </View>
        <Text style={styles.timestamp}>
          {formatTimestamp(turn.startMs)}
          {turn.endMs > turn.startMs && ` - ${formatTimestamp(turn.endMs)}`}
        </Text>
      </View>
      <Text style={styles.turnText}>{turn.text}</Text>
      {turn.confidence < 0.8 && (
        <Text style={styles.confidenceWarning}>
          Low confidence ({Math.round(turn.confidence * 100)}%)
        </Text>
      )}
    </Animated.View>
  );
});

TranscriptTurnItem.displayName = "TranscriptTurnItem";

/**
 * LiveTranscript component props
 */
interface LiveTranscriptProps {
  turns: TranscriptTurn[];
  currentPartial: string;
  isConnected: boolean;
}

/**
 * Main LiveTranscript component
 */
const LiveTranscript: React.FC<LiveTranscriptProps> = ({
  turns,
  currentPartial,
  isConnected,
}) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const previousTurnsLength = useRef(turns.length);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim1 = useRef(new Animated.Value(0.3)).current;
  const waveAnim2 = useRef(new Animated.Value(0.3)).current;
  const waveAnim3 = useRef(new Animated.Value(0.3)).current;

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (turns.length > previousTurnsLength.current || currentPartial) {
      // Slight delay to ensure layout is complete
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
    previousTurnsLength.current = turns.length;
  }, [turns.length, currentPartial]);

  // Pulse animation for partial text
  useEffect(() => {
    if (currentPartial) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [currentPartial, pulseAnim]);

  // Sound wave animation for listening state
  useEffect(() => {
    if (isConnected && turns.length === 0 && !currentPartial) {
      const createWaveAnim = (anim: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.3,
              duration: 400,
              useNativeDriver: true,
            }),
          ])
        );

      const wave1 = createWaveAnim(waveAnim1, 0);
      const wave2 = createWaveAnim(waveAnim2, 150);
      const wave3 = createWaveAnim(waveAnim3, 300);

      wave1.start();
      wave2.start();
      wave3.start();

      return () => {
        wave1.stop();
        wave2.stop();
        wave3.stop();
      };
    }
  }, [isConnected, turns.length, currentPartial, waveAnim1, waveAnim2, waveAnim3]);

  // Empty state - not connected
  if (!isConnected && turns.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MessageCircle size={32} color={Colors.textMuted} />
        <Text style={styles.emptyText}>
          Live transcription will appear here
        </Text>
        <Text style={styles.emptySubtext}>
          Connecting to transcription service...
        </Text>
      </View>
    );
  }

  // Listening state - connected but no speech yet
  if (isConnected && turns.length === 0 && !currentPartial) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.listeningIndicator}>
          <Mic size={24} color="#10B981" />
          <View style={styles.soundWaves}>
            <Animated.View
              style={[
                styles.soundWave,
                { opacity: waveAnim1, transform: [{ scaleY: waveAnim1 }] },
              ]}
            />
            <Animated.View
              style={[
                styles.soundWave,
                styles.soundWaveTall,
                { opacity: waveAnim2, transform: [{ scaleY: waveAnim2 }] },
              ]}
            />
            <Animated.View
              style={[
                styles.soundWave,
                { opacity: waveAnim3, transform: [{ scaleY: waveAnim3 }] },
              ]}
            />
          </View>
        </View>
        <Text style={styles.emptyText}>Listening...</Text>
        <Text style={styles.emptySubtext}>
          Start speaking to see live transcription
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Users size={16} color={Colors.textMuted} />
        <Text style={styles.headerText}>Live Transcript</Text>
        {turns.length > 0 && (
          <View style={styles.headerBadge}>
            <Text style={styles.turnCount}>{turns.length}</Text>
          </View>
        )}
        {isConnected && (
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>

      {/* Transcript content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* FinalTranscript turns */}
        {turns.map((turn, index) => (
          <TranscriptTurnItem
            key={turn.id}
            turn={turn}
            isNew={index === turns.length - 1}
          />
        ))}

        {/* PartialTranscript - current interim result */}
        {currentPartial && (
          <Animated.View
            style={[styles.partialContainer, { opacity: pulseAnim }]}
          >
            <View style={styles.partialIndicator}>
              <Volume2 size={14} color="#F59E0B" />
              <Text style={styles.partialLabel}>Transcribing...</Text>
            </View>
            <Text style={styles.partialText}>{currentPartial}</Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  headerText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    flex: 1,
  },
  headerBadge: {
    backgroundColor: Colors.primary + "20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  turnCount: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: "600",
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#10B981" + "20",
    borderRadius: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  liveText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#10B981",
    letterSpacing: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  turnContainer: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "40",
  },
  turnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  speakerBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  speakerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  speakerName: {
    fontSize: 12,
    fontWeight: "600",
  },
  timestamp: {
    fontSize: 11,
    color: Colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  turnText: {
    fontSize: 15,
    lineHeight: 24,
    color: Colors.text,
  },
  confidenceWarning: {
    fontSize: 11,
    color: Colors.warning,
    marginTop: 4,
    fontStyle: "italic",
  },
  partialContainer: {
    marginTop: 8,
    paddingTop: 16,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: "#F59E0B" + "10",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F59E0B" + "30",
    borderStyle: "dashed",
  },
  partialIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  partialLabel: {
    fontSize: 11,
    color: "#F59E0B",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  partialText: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textMuted,
    fontStyle: "italic",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "500",
    color: Colors.text,
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
  },
  listeningIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 8,
  },
  soundWaves: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  soundWave: {
    width: 4,
    height: 16,
    backgroundColor: "#10B981",
    borderRadius: 2,
  },
  soundWaveTall: {
    height: 24,
  },
});

export default LiveTranscript;
