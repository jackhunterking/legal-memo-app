import { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Animated,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ban, Clock, FileText } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

Dimensions.get("window");

const STEPS = [
  {
    icon: Ban,
    title: "Eliminate Disputes",
    subtitle: "Never miss critical agreements",
    description: "Refer back to the exact moment a client agreed to the terms.",
  },
  {
    icon: Clock,
    title: "Recover Billable Hours",
    subtitle: "Track every minute accurately",
    description: "Automated duration tracking ensures you bill for every minute.",
  },
  {
    icon: FileText,
    title: "Instant Meeting Summaries",
    subtitle: "Stop taking notes",
    description: "Get accurate transcripts & summaries instantly with exact speaker attribution.",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const handleNext = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (currentStep < STEPS.length - 1) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();

      setTimeout(() => setCurrentStep(currentStep + 1), 150);
    } else {
      router.replace("/auth");
    }
  };

  const renderStep = () => {
    const step = STEPS[currentStep];
    const Icon = step.icon;

    return (
      <Animated.View style={[styles.stepContent, { opacity: fadeAnim }]}>
        <View style={styles.iconContainer}>
          <Icon size={64} color={Colors.accentLight} strokeWidth={1.5} />
        </View>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.subtitle}>{step.subtitle}</Text>
        <Text style={styles.description}>{step.description}</Text>
      </Animated.View>
    );
  };

  const isLastStep = currentStep === STEPS.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {renderStep()}

        <View style={styles.footer}>
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === currentStep && styles.dotActive]}
              />
            ))}
          </View>

          <Pressable style={styles.button} onPress={handleNext}>
            <Text style={styles.buttonText}>
              {isLastStep ? "Get Started" : "Next"}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  stepContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "500" as const,
    color: Colors.accentLight,
    textAlign: "center",
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  footer: {
    paddingBottom: 24,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: Colors.accentLight,
    width: 24,
  },
  button: {
    backgroundColor: Colors.accentLight,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.text,
  },
});
