import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CentersScreen } from "@/screens/CentersScreen";

export default function App() {
  return (
    <SafeAreaProvider>
      <CentersScreen />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
