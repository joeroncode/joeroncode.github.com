import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LoginScreen } from "../screens/LoginScreen";
import { OrderQueueScreen } from "../screens/OrderQueueScreen";
import { ResultScreen } from "../screens/ResultScreen";
import { VerifyScreen } from "../screens/VerifyScreen";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="OrderQueue" component={OrderQueueScreen} options={{ title: "Orders to verify" }} />
        <Stack.Screen name="Verify" component={VerifyScreen} options={{ title: "Verify order" }} />
        <Stack.Screen name="Result" component={ResultScreen} options={{ title: "Verification result" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
