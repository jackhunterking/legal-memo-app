import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import React, { useEffect, useCallback, useState } from "react";
import { Alert } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { MeetingProvider } from "@/contexts/MeetingContext";
import { ContactProvider } from "@/contexts/ContactContext";
import { UsageProvider, useUsage } from "@/contexts/UsageContext";
import Colors from "@/constants/colors";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

/**
 * Deep Link Handler Component
 * Handles Universal Link redirects from Polar checkout success
 */
function DeepLinkHandler({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { refreshSubscription, hasActiveSubscription } = useUsage();

  // Handle deep links for checkout success
  const handleDeepLink = useCallback(async (event: { url: string }) => {
    const url = event.url;
    console.log('[DeepLink] Received URL:', url);

    // Check if this is a checkout success redirect
    // URL format: https://legalmemo.app/checkout/success
    if (url.includes('/checkout/success') || url.includes('checkout-success')) {
      console.log('[DeepLink] Checkout success detected, waiting for webhook to process...');
      
      // Wait a bit for the Polar webhook to process and update the database
      // This ensures the subscription is active when we refresh
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Refresh subscription data from database
      console.log('[DeepLink] Refreshing subscription data...');
      await refreshSubscription();
      
      // Small delay to let React Query update the state
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Navigate to home - user can start using the app immediately
      router.replace('/(tabs)/home');
      
      // Show success message
      Alert.alert(
        'Welcome to Pro! 🎉',
        'Your unlimited access is now active. Start recording meetings with no limits!',
        [{ text: 'Get Started', style: 'default' }]
      );
    }
  }, [refreshSubscription, router]);

  // Set up deep link listener
  useEffect(() => {
    // Handle deep links when app is already open
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [handleDeepLink]);

  return <>{children}</>;
}

function RootLayoutNav() {
  const { isLoading: authLoading } = useAuth();
  const { isLoading: usageLoading } = useUsage();
  const [isAppReady, setIsAppReady] = useState(false);

  // Wait for critical contexts to load before hiding splash screen
  // This prevents the "first click doesn't work" issue
  useEffect(() => {
    if (!authLoading && !usageLoading && !isAppReady) {
      console.log('[RootLayout] App ready, hiding splash screen');
      SplashScreen.hideAsync();
      setIsAppReady(true);
    }
  }, [authLoading, usageLoading, isAppReady]);

  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="recording" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="processing" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="meeting/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="contact/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="edit-meeting" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="edit-contact" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="search" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="subscription" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" options={{ title: "Not Found" }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Splash screen hiding is now handled in RootLayoutNav
  // after contexts are loaded, preventing the "first click doesn't work" issue

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          <UsageProvider>
            <DeepLinkHandler>
              <MeetingProvider>
                <ContactProvider>
                  <StatusBar style="light" />
                  <RootLayoutNav />
                </ContactProvider>
              </MeetingProvider>
            </DeepLinkHandler>
          </UsageProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
