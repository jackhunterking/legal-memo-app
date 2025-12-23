/**
 * Meeting Detail Screen
 * 
 * Displays meeting details, audio playback, and transcript.
 * 
 * Per Expo Audio documentation:
 * - Uses useAudioPlayer hook for audio playback
 * - Uses useAudioPlayerStatus for real-time status updates
 * - Properly manages audio lifecycle
 * 
 * @see .cursor/expo-audio-documentation.md
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Share,
} from "react-native";
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from "expo-audio";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronLeft,
  Play,
  Pause,
  Trash2,
  AlertTriangle,
  Search,
  X,
  Clock,
  RefreshCw,
  Share2,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMeetingDetails, useMeetings } from "@/contexts/MeetingContext";
import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";
import { formatDuration, formatTimestamp, getStatusInfo } from "@/types";
import { PLAYBACK_AUDIO_MODE } from "@/lib/audio-config";

/**
 * Transcript Bottom Sheet Component
 * Displays full transcript with search and seek functionality
 */
const TranscriptBottomSheet = ({
  visible,
  onClose,
  segments,
  onSeek,
}: {
  visible: boolean;
  onClose: () => void;
  segments?: Array<{ id: string; speaker: string; text: string; start_ms: number; end_ms: number }>;
  onSeek?: (ms: number) => void;
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSegments = segments?.filter((segment) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return segment.text.toLowerCase().includes(query) || segment.speaker.toLowerCase().includes(query);
  }) || [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.bottomSheetOverlay}>
        <Pressable style={styles.bottomSheetBackdrop} onPress={onClose} />
        <View style={styles.bottomSheetContainer}>
          <View style={styles.bottomSheetHandle} />
          <View style={styles.bottomSheetHeader}>
            <Text style={styles.bottomSheetTitle}>Transcript</Text>
            <Pressable onPress={onClose} style={styles.bottomSheetClose}>
              <X size={24} color={Colors.text} />
            </Pressable>
          </View>

          <View style={styles.transcriptSearchContainer}>
            <Search size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.transcriptSearchInput}
              placeholder="Search in transcript..."
              placeholderTextColor={Colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")}>
                <X size={18} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>

          <ScrollView style={styles.bottomSheetContent} showsVerticalScrollIndicator={false}>
            {filteredSegments.length > 0 ? (
              filteredSegments.map((segment) => (
                <Pressable
                  key={segment.id}
                  style={styles.transcriptSegment}
                  onPress={() => {
                    if (onSeek) onSeek(segment.start_ms);
                    if (Platform.OS !== "web") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                >
                  <View style={styles.transcriptSegmentHeader}>
                    <Text style={styles.transcriptSpeaker}>{segment.speaker}</Text>
                    <Text style={styles.transcriptTimestamp}>{formatTimestamp(segment.start_ms)}</Text>
                  </View>
                  <Text style={styles.transcriptSegmentText}>{segment.text}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.noDataText}>
                {searchQuery.trim() ? "No matches found" : "No transcript available"}
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default function MeetingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: meeting, isLoading, refetch } = useMeetingDetails(id || null);
  const { deleteMeeting, retryProcessing, isRetrying } = useMeetings();

  // UI state
  const [showTranscript, setShowTranscript] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  // Audio loading state
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioLoadError, setAudioLoadError] = useState(false);
  const [audioErrorMessage, setAudioErrorMessage] = useState<string | null>(null);

  // Blob URL ref for cleanup (web only)
  const blobUrlRef = useRef<string | null>(null);

  /**
   * Audio player using useAudioPlayer hook per Expo Audio docs
   * The hook manages the player's lifecycle automatically
   */
  const player = useAudioPlayer(audioUri ? { uri: audioUri } : null);
  
  /**
   * Real-time playback status using useAudioPlayerStatus hook
   * Returns playing, currentTime, duration, isBuffering, etc.
   */
  const status = useAudioPlayerStatus(player);

  const title = meeting?.title || "Meeting";
  const transcript = meeting?.transcript;
  const segments = meeting?.segments;

  /**
   * Load audio from Supabase Storage
   * Downloads the file and creates a URI for playback
   */
  const loadAudio = useCallback(async () => {
    // Prefer MP3 if available, fallback to raw audio
    const audioPath = meeting?.mp3_audio_path || meeting?.raw_audio_path;
    if (!audioPath || audioUri) return;

    try {
      console.log("[AudioPlayer] Loading audio from path:", audioPath);
      setIsAudioLoading(true);
      setAudioLoadError(false);
      setAudioErrorMessage(null);

      // Download audio from Supabase Storage
      const { data: audioBlob, error: downloadError } = await supabase.storage
        .from("meeting-audio")
        .download(audioPath);

      if (downloadError || !audioBlob) {
        console.error("[AudioPlayer] Download error:", downloadError);
        setAudioLoadError(true);
        setAudioErrorMessage(downloadError?.message || "Could not download audio");
        return;
      }

      console.log("[AudioPlayer] Audio downloaded, size:", audioBlob.size);

      let newAudioUri: string;

      if (Platform.OS === "web") {
        // On web, create a blob URL
        newAudioUri = URL.createObjectURL(audioBlob);
        blobUrlRef.current = newAudioUri;
      } else {
        // On native, convert to data URI
        const reader = new FileReader();
        newAudioUri = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
            } else {
              reject(new Error("Failed to convert audio to base64"));
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(audioBlob);
        });
      }

      // Configure audio mode for playback per Expo Audio docs
      await setAudioModeAsync(PLAYBACK_AUDIO_MODE);

      // Set the audio URI - this will update the player via useAudioPlayer
      setAudioUri(newAudioUri);
      
      setAudioLoadError(false);
      setAudioErrorMessage(null);
      console.log("[AudioPlayer] Audio loaded successfully");
    } catch (error) {
      console.error("[AudioPlayer] Failed to load audio:", error);
      setAudioLoadError(true);
      setAudioErrorMessage(error instanceof Error ? error.message : "Could not play audio");
    } finally {
      setIsAudioLoading(false);
    }
  }, [meeting?.mp3_audio_path, meeting?.raw_audio_path, audioUri]);

  /**
   * Load audio when meeting is ready
   */
  useEffect(() => {
    const canLoadAudio = 
      (meeting?.mp3_audio_path || meeting?.raw_audio_path) && 
      meeting?.status === "ready";

    if (canLoadAudio) {
      loadAudio();
    }
  }, [meeting?.mp3_audio_path, meeting?.raw_audio_path, meeting?.status, loadAudio]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Revoke blob URL on web
      if (blobUrlRef.current && Platform.OS === "web") {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  /**
   * Handle play/pause
   * Uses player.play() and player.pause() per Expo Audio docs
   */
  const handlePlayPause = async () => {
    if (!audioUri) {
      await loadAudio();
      return;
    }

    try {
      if (status.playing) {
        player.pause();
      } else {
        player.play();
      }
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.error("[AudioPlayer] Play/pause error:", error);
    }
  };

  /**
   * Handle seek via progress bar tap
   * Uses player.seekTo(seconds) per Expo Audio docs
   */
  const handleSeek = async (event: { nativeEvent: { locationX: number } }) => {
    if (!status.duration || !progressBarWidth) return;

    const x = event.nativeEvent.locationX;
    const percentage = Math.max(0, Math.min(1, x / progressBarWidth));
    const seekPositionSeconds = percentage * status.duration;

    try {
      await player.seekTo(seekPositionSeconds);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.error("[AudioPlayer] Seek error:", error);
    }
  };

  /**
   * Handle seek to specific timestamp (from transcript)
   */
  const handleSeekToTimestamp = async (ms: number) => {
    if (!audioUri) return;
    try {
      await player.seekTo(ms / 1000);
      if (!status.playing) {
        player.play();
      }
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.error("[AudioPlayer] Seek error:", error);
    }
  };

  /**
   * Format time for display
   */
  const formatTime = (seconds: number) => {
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate progress percentage
  const progress = status.duration > 0 ? (status.currentTime / status.duration) * 100 : 0;

  /**
   * Handle meeting deletion
   */
  const handleDelete = async () => {
    if (!id) return;

    const performDelete = async () => {
      try {
        await deleteMeeting(id);
        router.replace("/(tabs)/meetings");
      } catch (err) {
        console.error("[MeetingDetail] Delete error:", err);
      }
    };

    if (Platform.OS === "web") {
      if (confirm("Delete this meeting? This action cannot be undone.")) {
        performDelete();
      }
    } else {
      Alert.alert(
        "Delete Meeting",
        "Are you sure? This will permanently delete the meeting and all associated data.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: performDelete },
        ]
      );
    }
  };

  /**
   * Handle retry processing
   */
  const handleRetry = async () => {
    if (!id) return;
    try {
      await retryProcessing(id);
      await refetch();
    } catch (err) {
      console.error("[MeetingDetail] Retry error:", err);
    }
  };

  /**
   * Handle share
   */
  const handleShare = async () => {
    const shareText = `
${title}
Date: ${new Date(meeting?.created_at || "").toLocaleDateString()}
Duration: ${formatDuration(meeting?.duration_seconds || 0)}

Summary:
${transcript?.summary || "No summary available"}
    `.trim();

    try {
      if (Platform.OS === "web") {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareText);
          alert("Meeting notes copied to clipboard!");
        }
      } else {
        await Share.share({ message: shareText, title });
      }
    } catch (error) {
      console.error("[Share] Error:", error);
    }
  };

  // Loading state
  if (isLoading || !meeting) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accentLight} />
        </View>
      </SafeAreaView>
    );
  }

  const shouldShowAudioBar = !!(meeting.mp3_audio_path || meeting.raw_audio_path) && meeting.status === "ready";
  const statusInfo = getStatusInfo(meeting.status);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerActionButton} onPress={handleShare}>
            <Share2 size={20} color={Colors.text} />
          </Pressable>
          <Pressable style={styles.headerActionButton} onPress={handleDelete}>
            <Trash2 size={20} color={Colors.error} />
          </Pressable>
        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Banner (if not ready) */}
        {meeting.status !== 'ready' && (
          <View style={[styles.statusBanner, { backgroundColor: `${statusInfo.color}20` }]}>
            <Text style={[styles.statusBannerText, { color: statusInfo.color }]}>
              {statusInfo.label}
            </Text>
            {meeting.status === 'failed' && (
              <Pressable style={styles.retryBannerButton} onPress={handleRetry} disabled={isRetrying}>
                <RefreshCw size={16} color={Colors.accentLight} />
                <Text style={styles.retryBannerText}>Retry</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Meeting Details */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Clock size={18} color={Colors.textMuted} />
            <Text style={styles.detailText}>
              {new Date(meeting.created_at).toLocaleDateString()} at{" "}
              {new Date(meeting.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Duration:</Text>
            <Text style={styles.detailText}>{formatDuration(meeting.duration_seconds)}</Text>
          </View>
          {meeting.used_streaming_transcription && (
            <View style={styles.detailRow}>
              <Text style={styles.streamingBadge}>Live Transcribed</Text>
            </View>
          )}
        </View>

        {/* Summary Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Summary</Text>
          {transcript?.summary ? (
            <Text style={styles.summaryText}>{transcript.summary}</Text>
          ) : (
            <Text style={styles.noDataText}>
              {meeting.status === "transcribing" || meeting.status === "converting"
                ? "Summary is being generated..."
                : meeting.status === "failed"
                ? "Processing failed. Tap retry above."
                : "No summary available"}
            </Text>
          )}
        </View>

        {/* Transcript Preview */}
        {transcript?.full_text && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Transcript</Text>
              <Pressable onPress={() => setShowTranscript(true)}>
                <Text style={styles.viewAllLink}>View Full</Text>
              </Pressable>
            </View>
            <Text style={styles.transcriptPreview} numberOfLines={4}>
              {transcript.full_text}
            </Text>
          </View>
        )}

        {/* Segments Preview (if streaming was used) */}
        {segments && segments.length > 0 && !transcript?.full_text && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Transcript Segments</Text>
              <Pressable onPress={() => setShowTranscript(true)}>
                <Text style={styles.viewAllLink}>View All ({segments.length})</Text>
              </Pressable>
            </View>
            <Text style={styles.transcriptPreview} numberOfLines={4}>
              {segments.slice(0, 3).map(s => `${s.speaker}: ${s.text}`).join('\n')}
            </Text>
          </View>
        )}

        {/* Error Message */}
        {meeting.error_message && (
          <View style={styles.errorCard}>
            <AlertTriangle size={20} color={Colors.error} />
            <Text style={styles.errorText}>{meeting.error_message}</Text>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Audio Player Bar */}
      {shouldShowAudioBar && (
        <View style={styles.audioBar}>
          {audioLoadError ? (
            <View style={styles.audioErrorContainer}>
              <AlertTriangle size={16} color={Colors.warning} />
              <Text style={styles.audioErrorText} numberOfLines={2}>
                {audioErrorMessage || "Audio unavailable"}
              </Text>
            </View>
          ) : isAudioLoading ? (
            <View style={styles.audioErrorContainer}>
              <ActivityIndicator size="small" color={Colors.accentLight} />
              <Text style={styles.audioErrorText}>Loading audio...</Text>
            </View>
          ) : (
            <>
              <Pressable 
                style={styles.playButton} 
                onPress={handlePlayPause} 
                disabled={isAudioLoading || status.isBuffering}
              >
                {status.isBuffering ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : status.playing ? (
                  <Pause size={20} color={Colors.text} fill={Colors.text} />
                ) : (
                  <Play size={20} color={Colors.text} fill={Colors.text} />
                )}
              </Pressable>

              <Pressable style={styles.audioProgressContainer} onPress={handleSeek}>
                <View
                  style={styles.audioProgress}
                  onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
                >
                  <View style={[styles.audioProgressBar, { width: `${progress}%` }]} />
                  <View style={[styles.audioProgressThumb, { left: `${progress}%` }]} />
                </View>
              </Pressable>

              <Text style={styles.audioTime}>
                {formatTime(status.currentTime || 0)} / {formatTime(status.duration || meeting.duration_seconds)}
              </Text>

              {segments && segments.length > 0 && (
                <Pressable style={styles.transcriptButton} onPress={() => setShowTranscript(true)}>
                  <Text style={styles.transcriptButtonText}>Transcript</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      )}

      {/* Transcript Modal */}
      <TranscriptBottomSheet
        visible={showTranscript}
        onClose={() => setShowTranscript(false)}
        segments={segments}
        onSeek={handleSeekToTimestamp}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backButton: {
    padding: 4,
    marginRight: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "center",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerActionButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  statusBannerText: {
    fontSize: 14,
    fontWeight: "600",
  },
  retryBannerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
    borderRadius: 16,
  },
  retryBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.accentLight,
  },
  detailsCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailLabel: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  detailText: {
    fontSize: 14,
    color: Colors.text,
  },
  streamingBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10B981",
    backgroundColor: "#10B981" + "20",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 12,
  },
  viewAllLink: {
    fontSize: 14,
    color: Colors.accentLight,
    fontWeight: "500",
  },
  summaryText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  transcriptPreview: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  noDataText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    paddingVertical: 16,
  },
  errorCard: {
    backgroundColor: `${Colors.error}15`,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.error,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: Colors.error,
    lineHeight: 20,
  },
  audioBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 12,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accentLight,
    justifyContent: "center",
    alignItems: "center",
  },
  audioProgressContainer: {
    flex: 1,
    height: 32,
    justifyContent: "center",
  },
  audioProgress: {
    height: 4,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 2,
    position: "relative",
  },
  audioProgressBar: {
    height: "100%",
    backgroundColor: Colors.accentLight,
    borderRadius: 2,
  },
  audioProgressThumb: {
    position: "absolute",
    top: -4,
    marginLeft: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accentLight,
  },
  audioTime: {
    fontSize: 11,
    color: Colors.textMuted,
    minWidth: 70,
  },
  transcriptButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 6,
  },
  transcriptButtonText: {
    fontSize: 12,
    color: Colors.accentLight,
    fontWeight: "500",
  },
  audioErrorContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  audioErrorText: {
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
    flexWrap: "wrap",
  },
  // Bottom Sheet Styles
  bottomSheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  bottomSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  bottomSheetContainer: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingBottom: Platform.OS === "ios" ? 20 : 0,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  bottomSheetTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
  },
  bottomSheetClose: {
    padding: 4,
  },
  bottomSheetContent: {
    padding: 20,
  },
  transcriptSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  transcriptSearchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    padding: 0,
  },
  transcriptSegment: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  transcriptSegmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  transcriptSpeaker: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.accentLight,
  },
  transcriptTimestamp: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  transcriptSegmentText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 21,
  },
});
