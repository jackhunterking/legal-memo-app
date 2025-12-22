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
import { Shield, Mic, FileText, CheckCircle } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

Dimensions.get("window");

const STEPS = [
  {
    icon: Shield,
    title: "Legal Meeting Intelligence",
    subtitle: "Your AI-powered meeting assistant for legal professionals",
    description: "Record meetings, get AI summaries, track action items, and bill accurately.",
  },
  {
    icon: Mic,
    title: "One-Button Recording",
    subtitle: "Start recording instantly",
    description: "No setup required. Just tap and record. Add details later if needed.",
  },
  {
    icon: FileText,
    title: "AI-Powered Summaries",
    subtitle: "Structured legal documentation",
    description: "Get key facts, legal issues, decisions, risks, and action items automatically extracted.",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const handleNext = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (currentStep < STEPS.length) {
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

  const toggleTerms = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setAgreedToTerms(!agreedToTerms);
  };

  const renderStep = () => {
    if (currentStep < STEPS.length) {
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
    }

    return (
      <Animated.View style={[styles.stepContent, { opacity: fadeAnim }]}>
        <View style={styles.iconContainer}>
          <Shield size={64} color={Colors.accentLight} strokeWidth={1.5} />
        </View>
        <Text style={styles.title}>Legal Disclaimer</Text>
        <Text style={styles.disclaimerText}>
          This app uses AI to generate meeting summaries and documentation.
          {"\n\n"}
          <Text style={styles.boldText}>Important:</Text>
          {"\n"}• AI-generated content may contain errors
          {"\n"}• This is NOT legal advice
          {"\n"}• Always verify important information
          {"\n"}• You are responsible for ensuring recording consent
          {"\n"}• Check local laws regarding recording
        </Text>

        <Pressable style={styles.checkboxRow} onPress={toggleTerms}>
          <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
            {agreedToTerms && <CheckCircle size={20} color={Colors.text} />}
          </View>
          <Text style={styles.checkboxLabel}>I understand and agree</Text>
        </Pressable>
      </Animated.View>
    );
  };

  const isLastStep = currentStep === STEPS.length;
  const canProceed = !isLastStep || agreedToTerms;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {renderStep()}

        <View style={styles.footer}>
          <View style={styles.dots}>
            {[...Array(STEPS.length + 1)].map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === currentStep && styles.dotActive]}
              />
            ))}
          </View>

          <Pressable
            style={[styles.button, !canProceed && styles.buttonDisabled]}
            onPress={handleNext}
            disabled={!canProceed}
          >
            <Text style={styles.buttonText}>
              {isLastStep ? "Continue" : "Next"}
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
  disclaimerText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "left",
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  boldText: {
    fontWeight: "700" as const,
    color: Colors.text,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 32,
    paddingVertical: 12,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: Colors.accentLight,
    borderColor: Colors.accentLight,
  },
  checkboxLabel: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: "500" as const,
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
  buttonDisabled: {
    backgroundColor: Colors.surfaceLight,
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.text,
  },
});
