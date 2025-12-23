/**
 * LiveTranscript Component
 * 
 * Displays real-time transcription with speaker diarization.
 * Shows speaker labels, timestamps, and animates incoming text.
 */

import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
} from "react-native";
import { Users, MessageCircle } from "lucide-react-native";
import Colors from "@/constants/colors";
import { TranscriptTurn } from "@/hooks/useStreamingTranscription";

// Speaker colors for visual differentiation
const SPEAKER_COLORS: Record<string, string> = {
  "Speaker A": "#3B82F6", // Blue
  "Speaker B": "#10B981", // Green
  "Speaker C": "#F59E0B", // Amber
  "Speaker D": "#8B5CF6", // Purple
  "Speaker E": "#EC4899", // Pink
  "Speaker F": "#06B6D4", // Cyan
};

// Get speaker color or generate one
const getSpeakerColor = (speaker: string): string => {
  if (SPEAKER_COLORS[speaker]) {
    return SPEAKER_COLORS[speaker];
  }
  // Generate a consistent color based on speaker name
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 50%)`;
};

// Format timestamp from milliseconds
const formatTimestamp = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

interface TranscriptTurnItemProps {
  turn: TranscriptTurn;
  isNew?: boolean;
}

const TranscriptTurnItem: React.FC<TranscriptTurnItemProps> = ({ turn, isNew }) => {
  const fadeAnim = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const speakerColor = getSpeakerColor(turn.speaker);

  useEffect(() => {
    if (isNew) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isNew, fadeAnim]);

  return (
    <Animated.View style={[styles.turnContainer, { opacity: fadeAnim }]}>
      <View style={styles.turnHeader}>
        <View style={[styles.speakerBadge, { backgroundColor: speakerColor + "20" }]}>
          <View style={[styles.speakerDot, { backgroundColor: speakerColor }]} />
          <Text style={[styles.speakerName, { color: speakerColor }]}>
            {turn.speaker}
          </Text>
        </View>
        <Text style={styles.timestamp}>{formatTimestamp(turn.startTime)}</Text>
      </View>
      <Text style={styles.turnText}>{turn.text}</Text>
    </Animated.View>
  );
};

interface LiveTranscriptProps {
  turns: TranscriptTurn[];
  currentPartial: string;
  isConnected: boolean;
}

const LiveTranscript: React.FC<LiveTranscriptProps> = ({
  turns,
  currentPartial,
  isConnected,
}) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const previousTurnsLength = useRef(turns.length);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (turns.length > previousTurnsLength.current || currentPartial) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
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
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [currentPartial, pulseAnim]);

  // Empty state
  if (!isConnected && turns.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MessageCircle size={32} color={Colors.textMuted} />
        <Text style={styles.emptyText}>
          Live transcription will appear here
        </Text>
        <Text style={styles.emptySubtext}>
          Speak clearly into your microphone
        </Text>
      </View>
    );
  }

  // Connecting state
  if (isConnected && turns.length === 0 && !currentPartial) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.listeningIndicator}>
          <Animated.View
            style={[
              styles.listeningDot,
              { transform: [{ scale: pulseAnim }] },
            ]}
          />
        </View>
        <Text style={styles.emptyText}>Listening...</Text>
        <Text style={styles.emptySubtext}>
          Start speaking to see transcription
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Users size={16} color={Colors.textMuted} />
        <Text style={styles.headerText}>Live Transcript</Text>
        {turns.length > 0 && (
          <Text style={styles.turnCount}>{turns.length} segments</Text>
        )}
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {turns.map((turn, index) => (
          <TranscriptTurnItem
            key={turn.id}
            turn={turn}
            isNew={index === turns.length - 1}
          />
        ))}

        {/* Current partial transcript */}
        {currentPartial && (
          <Animated.View
            style={[styles.partialContainer, { opacity: pulseAnim }]}
          >
            <View style={styles.partialIndicator}>
              <View style={styles.partialDot} />
              <Text style={styles.partialLabel}>Listening...</Text>
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
  turnCount: {
    fontSize: 12,
    color: Colors.textMuted,
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
  },
  turnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
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
    lineHeight: 22,
    color: Colors.text,
  },
  partialContainer: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderStyle: "dashed",
  },
  partialIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  partialDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F59E0B",
  },
  partialLabel: {
    fontSize: 11,
    color: "#F59E0B",
    fontWeight: "500",
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
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  listeningDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#10B981",
  },
});

export default LiveTranscript;

