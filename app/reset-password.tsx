import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Lock, Eye, EyeOff, ShieldCheck } from "lucide-react-native";
import { mediumImpact, successNotification, errorNotification } from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";

export default function ResetPasswordScreen() {
  const router = useRouter();
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

  // Check if we have a valid recovery session
  useEffect(() => {
    const checkSession = async () => {
      try {
        console.log("[ResetPassword] Checking for recovery session...");
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("[ResetPassword] Session error:", sessionError);
          setHasValidSession(false);
        } else if (session) {
          console.log("[ResetPassword] Valid session found:", {
            email: session.user?.email,
            userId: session.user?.id,
            expiresAt: session.expires_at,
          });
          setHasValidSession(true);
        } else {
          console.log("[ResetPassword] No session found - user may not have come from email link");
          setHasValidSession(false);
        }
      } catch (err) {
        console.error("[ResetPassword] Error checking session:", err);
        setHasValidSession(false);
      } finally {
        setIsCheckingSession(false);
      }
    };

    // Small delay to ensure session is fully established
    const timer = setTimeout(checkSession, 300);
    return () => clearTimeout(timer);
  }, []);

  const validatePassword = (): string | null => {
    if (!password.trim()) {
      return "Please enter a new password";
    }
    if (password.length < 6) {
      return "Password must be at least 6 characters";
    }
    if (!confirmPassword.trim()) {
      return "Please confirm your password";
    }
    if (password !== confirmPassword) {
      return "Passwords do not match";
    }
    return null;
  };

  const handleResetPassword = async () => {
    const validationError = validatePassword();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setIsLoading(true);
    
    if (Platform.OS !== "web") {
      mediumImpact();
    }

    try {
      console.log("[ResetPassword] Updating password...");
      
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }

      console.log("[ResetPassword] Password updated successfully");
      
      if (Platform.OS !== "web") {
        successNotification();
      }

      Alert.alert(
        "Password Updated",
        "Your password has been successfully reset. You can now sign in with your new password.",
        [
          {
            text: "Sign In",
            onPress: () => {
              // Sign out to clear the recovery session and force fresh login
              supabase.auth.signOut().then(() => {
                router.replace("/auth");
              });
            },
          },
        ]
      );
    } catch (err: unknown) {
      console.error("[ResetPassword] Error updating password:", err);
      
      if (Platform.OS !== "web") {
        errorNotification();
      }
      
      const errorMessage = err instanceof Error ? err.message : "Failed to reset password";
      
      // Handle specific error cases
      if (errorMessage.toLowerCase().includes("session") || 
          errorMessage.toLowerCase().includes("expired") ||
          errorMessage.toLowerCase().includes("invalid")) {
        setError("Your reset link has expired. Please request a new one.");
        Alert.alert(
          "Link Expired",
          "Your password reset link has expired. Please request a new one.",
          [
            {
              text: "Request New Link",
              onPress: () => router.replace("/auth"),
            },
          ]
        );
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToSignIn = () => {
    router.replace("/auth");
  };

  // Show loading while checking session
  if (isCheckingSession) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Verifying reset link...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show error if no valid session (user didn't come from email link)
  if (!hasValidSession) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.errorIconContainer}>
              <ShieldCheck size={48} color={Colors.error} />
            </View>
            <Text style={styles.title}>Invalid Reset Link</Text>
            <Text style={styles.subtitle}>
              This password reset link is invalid or has expired. Please request a new one.
            </Text>
          </View>

          <View style={styles.form}>
            <Pressable style={styles.button} onPress={handleBackToSignIn}>
              <Text style={styles.buttonText}>Back to Sign In</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <ShieldCheck size={48} color={Colors.accent} />
            </View>
            <Text style={styles.title}>Set New Password</Text>
            <Text style={styles.subtitle}>
              Enter your new password below. Make sure it's at least 6 characters.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Lock size={20} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="New Password"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!isLoading}
              />
              <Pressable
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                {showPassword ? (
                  <EyeOff size={20} color={Colors.textMuted} />
                ) : (
                  <Eye size={20} color={Colors.textMuted} />
                )}
              </Pressable>
            </View>

            <View style={styles.inputContainer}>
              <Lock size={20} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor={Colors.textMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                editable={!isLoading}
              />
              <Pressable
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeButton}
              >
                {showConfirmPassword ? (
                  <EyeOff size={20} color={Colors.textMuted} />
                ) : (
                  <Eye size={20} color={Colors.textMuted} />
                )}
              </Pressable>
            </View>

            <Text style={styles.passwordHint}>
              Password must be at least 6 characters
            </Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <Text style={styles.buttonText}>Reset Password</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.backButton}
              onPress={handleBackToSignIn}
              disabled={isLoading}
            >
              <Text style={styles.backButtonText}>Back to Sign In</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  header: {
    marginBottom: 40,
    alignItems: "center",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${Colors.accent}15`,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  errorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${Colors.error}15`,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: Colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 56,
    fontSize: 16,
    color: Colors.text,
  },
  eyeButton: {
    padding: 8,
  },
  passwordHint: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: -8,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: "center",
  },
  button: {
    backgroundColor: Colors.accentLight,
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  backButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  backButtonText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: "500" as const,
  },
});

