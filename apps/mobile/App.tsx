import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/lib/auth";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <RootNavigator />
    </AuthProvider>
  );
}
