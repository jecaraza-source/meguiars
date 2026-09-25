import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/auth/AuthProvider";
import { Router } from "@/navigation/Router";
import { ToastProvider } from "@/ui/overlay";

export default function App() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <AuthProvider>
          <Router />
        </AuthProvider>
      </ToastProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
