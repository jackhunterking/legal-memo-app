/**
 * LiveTranscript Component
 * 
 * Displays real-time transcription like a teleprompter.
 * Words appear as they're spoken with smooth animations.
 * 
 * Note: Speaker diarization is NOT available during live streaming.
 * Accurate speaker labels are added via batch processing after recording stops.
 * This component shows text only without speaker labels during live transcription.
 * 
 * Features:
 * - Instant display of partial (interim) transcripts
 * - Smooth transitions when partials become final
 * - Auto-scroll to keep latest content visible
 * - Clean text-only view during live streaming
 * - Large, readable text for teleprompter use
 */

import React, { useRef, useEffect, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
} from "react-native";
import { Mic, Volume2 } from "lucide-react-native";
import Colors from "@/constants/colors";
import type { TranscriptTurn } from "@/types";

/**
 * Individual transcript turn (final text)
 * Note: Speaker labels are NOT shown during live streaming since
 * AssemblyAI's real-time API doesn't support speaker diarization.
 * Speakers will be identified after recording via batch processing.
 */
interface TranscriptTurnItemProps {
  turn: TranscriptTurn;
  isLatest?: boolean;
}

const TranscriptTurnItem: React.FC<TranscriptTurnItemProps> = memo(({ turn, isLatest }) => {
  const fadeAnim = useRef(new Animated.Value(isLatest ? 0.7 : 1)).current;

  useEffect(() => {
    if (isLatest) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isLatest, fadeAnim]);

  return (
    <Animated.View style={[styles.turnContainer, { opacity: fadeAnim }]}>
      <Text style={styles.turnText}>{turn.text}</Text>
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
 * Main LiveTranscript component - Teleprompter View
 */
const LiveTranscript: React.FC<LiveTranscriptProps> = ({
  turns,
  currentPartial,
  isConnected,
}) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const previousContentLength = useRef(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim1 = useRef(new Animated.Value(0.3)).current;
  const waveAnim2 = useRef(new Animated.Value(0.3)).current;
  const waveAnim3 = useRef(new Animated.Value(0.3)).current;

  // Calculate total content length for scroll detection
  const contentLength = turns.reduce((acc, t) => acc + t.text.length, 0) + currentPartial.length;

  // Auto-scroll when new content arrives
  useEffect(() => {
    if (contentLength > previousContentLength.current) {
      // Immediate scroll for real-time feel
      scrollViewRef.current?.scrollToEnd({ animated: false });
    }
    previousContentLength.current = contentLength;
  }, [contentLength]);

  // Subtle pulse animation for partial text cursor
  useEffect(() => {
    if (currentPartial) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.5,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 400,
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
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.3,
              duration: 300,
              useNativeDriver: true,
            }),
          ])
        );

      const wave1 = createWaveAnim(waveAnim1, 0);
      const wave2 = createWaveAnim(waveAnim2, 100);
      const wave3 = createWaveAnim(waveAnim3, 200);

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

  // Listening state - connected but no speech yet
  if (isConnected && turns.length === 0 && !currentPartial) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.listeningIndicator}>
          <Mic size={28} color="#10B981" />
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
        <Text style={styles.listeningText}>Listening...</Text>
        <Text style={styles.listeningSubtext}>
          Start speaking to see live transcription
        </Text>
      </View>
    );
  }

  // Connecting state
  if (!isConnected && turns.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.connectingText}>Connecting...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Final transcript turns */}
        {turns.map((turn, index) => (
          <TranscriptTurnItem
            key={turn.id}
            turn={turn}
            isLatest={index === turns.length - 1 && !currentPartial}
          />
        ))}

        {/* Current partial (interim) transcript - appears immediately */}
        {currentPartial && (
          <View style={styles.partialContainer}>
            <View style={styles.partialHeader}>
              <Volume2 size={14} color="#F59E0B" />
              <Text style={styles.partialLabel}>Speaking...</Text>
            </View>
            <Text style={styles.partialText}>
              {currentPartial}
              <Animated.Text style={[styles.cursor, { opacity: pulseAnim }]}>
                |
              </Animated.Text>
            </Text>
          </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  turnContainer: {
    marginBottom: 12,
  },
  turnText: {
    fontSize: 18,
    lineHeight: 28,
    color: Colors.text,
    fontWeight: "400",
  },
  partialContainer: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  partialHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  partialLabel: {
    fontSize: 12,
    color: "#F59E0B",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  partialText: {
    fontSize: 18,
    lineHeight: 28,
    color: Colors.textMuted,
    fontStyle: "italic",
  },
  cursor: {
    color: "#F59E0B",
    fontWeight: "bold",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 32,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  listeningIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 16,
  },
  soundWaves: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  soundWave: {
    width: 4,
    height: 20,
    backgroundColor: "#10B981",
    borderRadius: 2,
  },
  soundWaveTall: {
    height: 28,
  },
  listeningText: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.text,
  },
  listeningSubtext: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 8,
    textAlign: "center",
  },
  connectingText: {
    fontSize: 16,
    color: Colors.textMuted,
  },
});

export default LiveTranscript;
