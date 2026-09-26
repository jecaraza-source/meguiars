import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/auth/AuthProvider";
import { Router } from "@/navigation/Router";

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Router />
      </AuthProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
