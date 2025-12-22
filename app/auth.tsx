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
import { Mail, Lock, Eye, EyeOff, Fingerprint } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { isBiometricSupported, getBiometricType, isBiometricEnabled, authenticateWithBiometrics, getBiometricCredentials, saveBiometricCredentials } from "@/lib/biometrics";

export default function AuthScreen() {
  const router = useRouter();
  const { signIn, signUp, isSigningIn, isSigningUp } = useAuth();
  
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  const isLoading = isSigningIn || isSigningUp;

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
          
          router.replace("/home");
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

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter email and password");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setError("");
    
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      if (isLogin) {
        await signIn({ email: email.trim(), password });
        
        if (biometricAvailable && biometricEnabled) {
          await saveBiometricCredentials({
            email: email.trim(),
            encryptedPassword: password,
          });
        }
        
        router.replace("/home");
      } else {
        await signUp({ email: email.trim(), password });
        router.replace({ pathname: "/email-confirmation", params: { email: email.trim() } });
      }
    } catch (err: unknown) {
      console.error("[Auth] Error:", err);
      const errorMessage = err instanceof Error ? err.message : "Authentication failed";
      setError(errorMessage);
      
      if (Platform.OS !== "web") {
        Alert.alert("Error", errorMessage);
      }
    }
  };

  const toggleMode = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsLogin(!isLogin);
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
              {isLogin ? "Welcome Back" : "Create Account"}
            </Text>
            <Text style={styles.subtitle}>
              {isLogin
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
                  {isLogin ? "Sign In" : "Create Account"}
                </Text>
              )}
            </Pressable>

            {isLogin && biometricAvailable && biometricEnabled && (
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
});
