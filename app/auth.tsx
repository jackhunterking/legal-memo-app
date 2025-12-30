import { useState, useEffect, useCallback } from "react";
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
import { Mail, Lock, Eye, EyeOff, Fingerprint, Gift } from "lucide-react-native";
import { SUBSCRIPTION_PLAN } from "@/types";
import { lightImpact, mediumImpact, successNotification } from "@/lib/haptics";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { isBiometricSupported, getBiometricType, isBiometricEnabled, authenticateWithBiometrics, getBiometricCredentials, saveBiometricCredentials } from "@/lib/biometrics";

export default function AuthScreen() {
  const router = useRouter();
  const { signIn, signUp, isSigningIn, isSigningUp } = useAuth();
  
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  const isLoading = isSigningIn || isSigningUp || isResettingPassword;

  const handleBiometricLogin = useCallback(async () => {
    try {
      const authenticated = await authenticateWithBiometrics();
      
      if (authenticated) {
        const credentials = await getBiometricCredentials();
        
        if (credentials) {
          setEmail(credentials.email);
          setPassword(credentials.encryptedPassword);
          
          await signIn({ 
            email: credentials.email, 
            password: credentials.encryptedPassword 
          });
          
          // Go directly to home after biometric sign in
          router.replace("/(tabs)/home");
        } else {
          Alert.alert(
            "Setup Required",
            "Please sign in with your password first to enable biometric login."
          );
        }
      }
    } catch (err: unknown) {
      console.error("[Auth] Biometric login error:", err);
      const errorMessage = err instanceof Error ? err.message : "Biometric login failed";
      if (Platform.OS !== "web") {
        Alert.alert("Error", errorMessage);
      }
    }
  }, [signIn, router]);

  useEffect(() => {
    const checkBiometric = async () => {
      const supported = await isBiometricSupported();
      if (supported) {
        const enabled = await isBiometricEnabled();
        const type = await getBiometricType();
        setBiometricAvailable(true);
        setBiometricEnabled(enabled);
        setBiometricType(type);
        
        if (enabled && isLogin) {
          handleBiometricLogin();
        }
      }
    };
    
    checkBiometric();
  }, [isLogin, handleBiometricLogin]);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }

    setError("");
    setIsResettingPassword(true);
    mediumImpact();

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: "legalmemo://reset-password",
        }
      );

      if (resetError) {
        throw resetError;
      }

      if (Platform.OS !== "web") {
        successNotification();
      }

      Alert.alert(
        "Check Your Email",
        "If an account exists with this email, you'll receive a password reset link shortly.",
        [
          {
            text: "OK",
            onPress: () => {
              setIsForgotPassword(false);
              setEmail("");
            },
          },
        ]
      );
    } catch (err: unknown) {
      console.error("[Auth] Password reset error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to send reset email";
      setError(errorMessage);
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleSubmit = async () => {
    // Handle forgot password flow
    if (isForgotPassword) {
      await handleForgotPassword();
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError("Please enter email and password");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setError("");
    
    mediumImpact();

    try {
      if (isLogin) {
        await signIn({ email: email.trim(), password });
        
        if (biometricAvailable && biometricEnabled) {
          await saveBiometricCredentials({
            email: email.trim(),
            encryptedPassword: password,
          });
        }
        
        // Go directly to home after sign in
        router.replace("/(tabs)/home");
      } else {
        await signUp({ email: email.trim(), password });
        router.replace({ pathname: "/email-confirmation", params: { email: email.trim() } });
      }
    } catch (err: unknown) {
      console.error("[Auth] Error:", err);
      const rawMessage = err instanceof Error ? err.message : "Authentication failed";
      
      // Parse Supabase error messages for better UX
      let errorMessage = rawMessage;
      
      // Handle signup with existing email
      if (!isLogin && (
        rawMessage.toLowerCase().includes("already registered") ||
        rawMessage.toLowerCase().includes("user already exists") ||
        rawMessage.toLowerCase().includes("email already")
      )) {
        errorMessage = "An account with this email already exists. Please sign in instead.";
        Alert.alert(
          "Account Exists",
          "An account with this email already exists. Would you like to sign in instead?",
          [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Sign In", 
              onPress: () => {
                setIsLogin(true);
                setError("");
              }
            },
          ]
        );
        return;
      }
      
      // Handle invalid credentials
      if (isLogin && rawMessage.toLowerCase().includes("invalid")) {
        errorMessage = "Invalid email or password. Please try again.";
      }
      
      setError(errorMessage);
      
      if (Platform.OS !== "web") {
        Alert.alert("Error", errorMessage);
      }
    }
  };

  const toggleMode = () => {
    if (Platform.OS !== "web") {
      lightImpact();
    }
    setIsLogin(!isLogin);
    setIsForgotPassword(false);
    setError("");
  };

  const toggleForgotPassword = () => {
    if (Platform.OS !== "web") {
      lightImpact();
    }
    setIsForgotPassword(!isForgotPassword);
    setError("");
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {isForgotPassword 
                ? "Reset Password" 
                : isLogin 
                  ? "Welcome Back" 
                  : "Create Account"}
            </Text>
            <Text style={styles.subtitle}>
              {isForgotPassword
                ? "Enter your email to receive a reset link"
                : isLogin
                  ? "Sign in to continue"
                  : "Start your legal meeting assistant"}
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Mail size={20} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
            </View>

            {/* Only show password field if not in forgot password mode */}
            {!isForgotPassword && (
              <View style={styles.inputContainer}>
                <Lock size={20} color={Colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
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
            )}

            {/* Forgot Password Link - only show on login screen */}
            {isLogin && !isForgotPassword && (
              <Pressable onPress={toggleForgotPassword} disabled={isLoading}>
                <Text style={styles.forgotPasswordLink}>Forgot password?</Text>
              </Pressable>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <Text style={styles.buttonText}>
                  {isForgotPassword 
                    ? "Send Reset Link" 
                    : isLogin 
                      ? "Sign In" 
                      : "Create Account"}
                </Text>
              )}
            </Pressable>

            {/* Back to Sign In - only show in forgot password mode */}
            {isForgotPassword && (
              <Pressable 
                style={styles.backToSignInButton}
                onPress={toggleForgotPassword} 
                disabled={isLoading}
              >
                <Text style={styles.backToSignInText}>Back to Sign In</Text>
              </Pressable>
            )}

            {/* Free Trial Banner - only show for signup */}
            {!isLogin && !isForgotPassword && (
              <View style={styles.trialBanner}>
                <Gift size={18} color={Colors.accent} />
                <Text style={styles.trialBannerText}>
                  {SUBSCRIPTION_PLAN.freeTrialDays}-day free trial • No credit card required
                </Text>
              </View>
            )}

            {isLogin && !isForgotPassword && biometricAvailable && biometricEnabled && (
              <Pressable
                style={[styles.biometricButton, isLoading && styles.buttonDisabled]}
                onPress={handleBiometricLogin}
                disabled={isLoading}
              >
                <Fingerprint size={24} color={Colors.accent} />
                <Text style={styles.biometricButtonText}>
                  Sign in with {biometricType || "Biometric"}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Footer - hide in forgot password mode */}
          {!isForgotPassword && (
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {isLogin ? "Don't have an account?" : "Already have an account?"}
              </Text>
              <Pressable onPress={toggleMode} disabled={isLoading}>
                <Text style={styles.footerLink}>
                  {isLogin ? "Sign Up" : "Sign In"}
                </Text>
              </Pressable>
            </View>
          )}
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
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "700" as const,
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
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
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: "center",
  },
  forgotPasswordLink: {
    color: Colors.accentLight,
    fontSize: 14,
    textAlign: "right",
    marginTop: -8,
  },
  button: {
    backgroundColor: Colors.accentLight,
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  backToSignInButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  backToSignInText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: "500" as const,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 32,
    gap: 8,
  },
  footerText: {
    color: Colors.textSecondary,
    fontSize: 15,
  },
  footerLink: {
    color: Colors.accentLight,
    fontSize: 15,
    fontWeight: "600" as const,
  },
  biometricButton: {
    backgroundColor: Colors.surface,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  biometricButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  trialBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: `${Colors.accent}15`,
    borderRadius: 10,
    marginTop: 8,
  },
  trialBannerText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.accent,
  },
});
