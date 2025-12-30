import { Tabs, Redirect } from "expo-router";
import { Mic, FolderOpen, Settings, Users } from "lucide-react-native";
import { Platform } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";

export default function TabsLayout() {
  const { isAuthenticated, hasCompletedOnboarding, isAuthLoading, isProfileLoading } = useAuth();

  // Show nothing while auth is loading to prevent flash
  if (isAuthLoading) {
    return null;
  }

  // If authenticated but profile still loading, wait (don't redirect prematurely)
  if (isAuthenticated && isProfileLoading) {
    return null;
  }

  // Redirect to index for proper routing if not authenticated or no profile
  if (!isAuthenticated || !hasCompletedOnboarding) {
    console.log("[TabsLayout] Redirecting to index:", { isAuthenticated, hasCompletedOnboarding });
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accentLight,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingBottom: Platform.OS === "ios" ? 20 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600" as const,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Record",
          tabBarIcon: ({ color, size }) => <Mic size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="meetings"
        options={{
          title: "Meetings",
          tabBarIcon: ({ color, size }) => <FolderOpen size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: "Contacts",
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
