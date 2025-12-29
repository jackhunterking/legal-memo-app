import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mail, ArrowLeft, RefreshCw, CheckCircle } from "lucide-react-native";
import { mediumImpact, successNotification, errorNotification, lightImpact } from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";

export default function EmailConfirmationScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const envelopeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.timing(envelopeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [pulseAnim, envelopeAnim]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || !email) return;
    
    mediumImpact();
    
    setIsResending(true);
    setResendSuccess(false);
    
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email,
        options: {
          emailRedirectTo: 'legalmemo://',
        }
      });
      
      if (error) throw error;
      
      setResendSuccess(true);
      setCooldown(60);
      
      successNotification();
    } catch (err) {
      console.error("[EmailConfirmation] Resend error:", err);
      errorNotification();
    } finally {
      setIsResending(false);
    }
  };

  const handleBackToSignIn = () => {
    if (Platform.OS !== "web") {
      lightImpact();
    }
    router.replace("/auth");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View
          style={[
            styles.iconContainer,
            {
              transform: [{ scale: pulseAnim }],
              opacity: envelopeAnim,
            },
          ]}
        >
          <View style={styles.iconOuter}>
            <View style={styles.iconInner}>
              <Mail size={48} color={Colors.accentLight} strokeWidth={1.5} />
            </View>
          </View>
        </Animated.View>

        <Text style={styles.title}>Check Your Email</Text>
        
        <Text style={styles.subtitle}>
          We&apos;ve sent a confirmation link to
        </Text>
        
        <View style={styles.emailContainer}>
          <Text style={styles.emailText}>{email || "your email"}</Text>
        </View>

        <Text style={styles.instructions}>
          Click the link in the email to verify your account and get started. 
          The link will expire in 24 hours.
        </Text>

        <View style={styles.divider} />

        <Text style={styles.helpText}>
          Didn&apos;t receive the email? Check your spam folder or try resending.
        </Text>

        {resendSuccess && (
          <View style={styles.successBanner}>
            <CheckCircle size={18} color={Colors.success} />
            <Text style={styles.successText}>Confirmation email sent!</Text>
          </View>
        )}

        <Pressable
          style={[
            styles.resendButton,
            (isResending || cooldown > 0) && styles.buttonDisabled,
          ]}
          onPress={handleResend}
          disabled={isResending || cooldown > 0}
        >
          {isResending ? (
            <ActivityIndicator size="small" color={Colors.text} />
          ) : (
            <>
              <RefreshCw size={20} color={Colors.text} />
              <Text style={styles.resendButtonText}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Email"}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable style={styles.backButton} onPress={handleBackToSignIn}>
          <ArrowLeft size={20} color={Colors.accentLight} />
          <Text style={styles.backButtonText}>Back to Sign In</Text>
        </Pressable>
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
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: 32,
  },
  iconOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(233, 69, 96, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  iconInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(233, 69, 96, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: Colors.text,
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  emailContainer: {
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emailText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.accentLight,
  },
  instructions: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  divider: {
    width: "60%",
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 28,
  },
  helpText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 20,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  successText: {
    fontSize: 14,
    color: Colors.success,
    fontWeight: "500" as const,
  },
  resendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 10,
    width: "100%",
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  resendButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "500" as const,
    color: Colors.accentLight,
  },
});
