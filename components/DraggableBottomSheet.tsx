import React, { useCallback, useMemo, forwardRef, useImperativeHandle, useRef, useEffect } from "react";
import { StyleSheet, View, Text, Pressable, Platform } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { X } from "lucide-react-native";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";

export interface DraggableBottomSheetRef {
  close: () => void;
  expand: () => void;
  collapse: () => void;
}

interface DraggableBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  snapPoints?: string[];
  enableFullScreen?: boolean;
  showHandle?: boolean;
  showCloseButton?: boolean;
  initialSnapIndex?: number;
}

/**
 * Reusable draggable bottom sheet component with native iOS-like behavior
 * - Drag from handle/header area to expand or collapse
 * - Content inside scrolls normally without triggering sheet pan
 * - Drag down from handle to dismiss
 * - Smooth animations and haptic feedback
 */
const DraggableBottomSheet = forwardRef<DraggableBottomSheetRef, DraggableBottomSheetProps>(
  (
    {
      visible,
      onClose,
      children,
      title,
      snapPoints = ["50%", "90%"],
      enableFullScreen = true,
      showHandle = true,
      showCloseButton = true,
      initialSnapIndex = 0,
    },
    ref
  ) => {
    const bottomSheetRef = useRef<BottomSheet>(null);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      close: () => bottomSheetRef.current?.close(),
      expand: () => bottomSheetRef.current?.expand(),
      collapse: () => bottomSheetRef.current?.collapse(),
    }));

    // Open/close based on visible prop
    useEffect(() => {
      if (visible) {
        bottomSheetRef.current?.snapToIndex(initialSnapIndex);
      } else {
        bottomSheetRef.current?.close();
      }
    }, [visible, initialSnapIndex]);

    // Backdrop component for dimming background
    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.6}
          pressBehavior="close"
        />
      ),
      []
    );

    // Handle close with haptic feedback
    const handleClose = useCallback(() => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      bottomSheetRef.current?.close();
      onClose();
    }, [onClose]);

    // Handle sheet changes (for haptic feedback)
    const handleSheetChanges = useCallback((index: number) => {
      if (index === -1) {
        // Sheet closed
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    }, []);

    // Memoize snap points
    const snapPointsMemo = useMemo(() => {
      if (enableFullScreen) {
        return snapPoints;
      }
      return [snapPoints[0]]; // Only first snap point if full screen disabled
    }, [snapPoints, enableFullScreen]);

    if (!visible) return null;

    return (
      <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <BottomSheet
          ref={bottomSheetRef}
          index={initialSnapIndex}
          snapPoints={snapPointsMemo}
          enablePanDownToClose={true}
          backdropComponent={renderBackdrop}
          onChange={handleSheetChanges}
          onClose={onClose}
          backgroundStyle={styles.bottomSheetBackground}
          handleIndicatorStyle={showHandle ? styles.handleIndicator : { display: "none" }}
          handleStyle={styles.handleContainer}
          style={styles.bottomSheet}
          // KEY: Only allow dragging from the handle, not from content
          // This allows BottomSheetScrollView to scroll normally
          enableContentPanningGesture={false}
          enableHandlePanningGesture={true}
        >
          <BottomSheetView style={styles.contentContainer}>
            {/* Header with title and close button - also draggable */}
            {(title || showCloseButton) && (
              <View style={styles.header}>
                {title && (
                  <View style={styles.titleContainer}>
                    <Text style={styles.title}>{title}</Text>
                  </View>
                )}
                {showCloseButton && (
                  <Pressable onPress={handleClose} style={styles.closeButton}>
                    <X size={24} color={Colors.textMuted} />
                  </Pressable>
                )}
              </View>
            )}

            {/* Content - scrolls independently */}
            <View style={styles.content}>{children}</View>
          </BottomSheetView>
        </BottomSheet>
      </GestureHandlerRootView>
    );
  }
);

DraggableBottomSheet.displayName = "DraggableBottomSheet";

const styles = StyleSheet.create({
  bottomSheet: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 24,
  },
  bottomSheetBackground: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleContainer: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 4,
  },
  handleIndicator: {
    backgroundColor: Colors.border,
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 12,
    backgroundColor: Colors.background,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.text,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});

export default DraggableBottomSheet;

