import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/auth/AuthProvider";
import { Router } from "@/navigation/Router";
import { ErrorBoundary } from "@/ui/ErrorBoundary";
import { ToastProvider } from "@/ui/overlay";

export default function App() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <ErrorBoundary>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </ErrorBoundary>
      </ToastProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
