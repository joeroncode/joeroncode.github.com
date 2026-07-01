import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Result">;

const VERDICT_COLORS: Record<string, string> = {
  MATCH: "#16a34a",
  PARTIAL_MATCH: "#d97706",
  MISMATCH: "#dc2626",
  NEEDS_REVIEW: "#6b7280",
};

export function ResultScreen({ route, navigation }: Props) {
  const { result } = route.params;
  const verdictColor = VERDICT_COLORS[result.verdict] ?? "#6b7280";

  return (
    <View style={styles.container}>
      <View style={[styles.verdictBanner, { backgroundColor: verdictColor }]}>
        <Text style={styles.verdictText}>{result.verdict.replace(/_/g, " ")}</Text>
        <Text style={styles.confidenceText}>{Math.round(result.confidence * 100)}% confidence</Text>
      </View>

      <Text style={styles.summary}>{result.summary}</Text>

      <FlatList
        data={result.itemResults}
        keyExtractor={(item) => item.orderItemId}
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={[styles.itemStatus, { color: item.matched ? "#16a34a" : "#dc2626" }]}>
              {item.matched ? "Detected" : "Missing"}
            </Text>
          </View>
        )}
      />

      <TouchableOpacity style={styles.button} onPress={() => navigation.popToTop()}>
        <Text style={styles.buttonText}>Back to queue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 16 },
  verdictBanner: { borderRadius: 10, padding: 16, marginBottom: 12 },
  verdictText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  confidenceText: { color: "#fff", marginTop: 4 },
  summary: { color: "#374151", marginBottom: 16 },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  itemName: { fontSize: 14 },
  itemStatus: { fontSize: 14, fontWeight: "600" },
  button: { backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "600" },
});
