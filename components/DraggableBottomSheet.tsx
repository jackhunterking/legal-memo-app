import React, { useCallback, useMemo, forwardRef, useImperativeHandle, useRef, useEffect } from "react";
import { StyleSheet, View, Text, Pressable, Dimensions } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView, BottomSheetView } from "@gorhom/bottom-sheet";
import { X } from "lucide-react-native";
import Colors from "@/constants/colors";
import { lightImpact } from "@/lib/haptics";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

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
  /** Height as percentage of screen - default is 92% (near full screen) */
  height?: number;
  showHandle?: boolean;
  showCloseButton?: boolean;
  /** Enable keyboard handling for text inputs - default is true */
  keyboardEnabled?: boolean;
  /** Use non-scrollable view instead of scroll view - useful for simple forms */
  useSimpleView?: boolean;
}

/**
 * iOS-style bottom sheet component
 * - Opens at near full screen height (with small gap at top to show it's a sheet)
 * - Drag handle at top to dismiss by dragging down
 * - Content inside is fully scrollable
 */
const DraggableBottomSheet = forwardRef<DraggableBottomSheetRef, DraggableBottomSheetProps>(
  (
    {
      visible,
      onClose,
      children,
      title,
      height = 92,
      showHandle = true,
      showCloseButton = true,
      keyboardEnabled = true,
      useSimpleView = false,
    },
    ref
  ) => {
    const bottomSheetRef = useRef<BottomSheet>(null);

    // Calculate snap point based on height prop
    const snapPoints = useMemo(() => [`${height}%`], [height]);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      close: () => bottomSheetRef.current?.close(),
      expand: () => bottomSheetRef.current?.expand(),
      collapse: () => bottomSheetRef.current?.collapse(),
    }));

    // Open/close based on visible prop
    useEffect(() => {
      if (visible) {
        bottomSheetRef.current?.snapToIndex(0);
      } else {
        bottomSheetRef.current?.close();
      }
    }, [visible]);

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
      lightImpact();
      bottomSheetRef.current?.close();
    }, []);

    // Handle sheet close event
    const handleSheetClose = useCallback(() => {
      onClose();
    }, [onClose]);

    // Handle sheet changes (for haptic feedback on snap)
    const handleSheetChanges = useCallback((index: number) => {
      if (index === 0) {
        lightImpact();
      }
    }, []);

    if (!visible) return null;

    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        enablePanDownToClose={true}
        backdropComponent={renderBackdrop}
        onChange={handleSheetChanges}
        onClose={handleSheetClose}
        backgroundStyle={styles.background}
        handleIndicatorStyle={showHandle ? styles.handleIndicator : styles.handleHidden}
        handleStyle={styles.handleContainer}
        style={styles.sheet}
        animateOnMount={true}
        enableDynamicSizing={false}
        keyboardBehavior={keyboardEnabled ? "extend" : "interactive"}
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              {title && <Text style={styles.title}>{title}</Text>}
            </View>
            {showCloseButton && (
              <Pressable onPress={handleClose} style={styles.closeButton}>
                <X size={22} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>
        )}

        {/* Content - Scrollable or Simple View */}
        {useSimpleView ? (
          <BottomSheetView style={styles.simpleView}>
            {children}
          </BottomSheetView>
        ) : (
          <BottomSheetScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {children}
          </BottomSheetScrollView>
        )}
      </BottomSheet>
    );
  }
);

DraggableBottomSheet.displayName = "DraggableBottomSheet";

const styles = StyleSheet.create({
  sheet: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 24,
  },
  background: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleContainer: {
    paddingTop: 12,
    paddingBottom: 0,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleIndicator: {
    backgroundColor: Colors.border,
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  handleHidden: {
    opacity: 0,
    height: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  simpleView: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
});

export default DraggableBottomSheet;
