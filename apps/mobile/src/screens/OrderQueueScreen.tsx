import type { OrderDTO } from "@ordercheck/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "OrderQueue">;

export function OrderQueueScreen({ navigation }: Props) {
  const { logout } = useAuth();
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await api.get<OrderDTO[]>("/orders?status=READY_FOR_VERIFICATION");
      setOrders(data);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => logout().then(() => navigation.replace("Login"))}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, logout]);

  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        onRefresh={load}
        refreshing={refreshing}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.empty}>No orders awaiting verification. Pull to refresh.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              navigation.navigate("Verify", {
                orderId: item.id,
                orderLabel: item.externalId ?? item.id.slice(0, 8),
              })
            }
          >
            <Text style={styles.cardTitle}>Order {item.externalId ?? item.id.slice(0, 8)}</Text>
            <Text style={styles.cardSubtitle}>
              {item.channel} · {item.items.length} item{item.items.length === 1 ? "" : "s"}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardSubtitle: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 48 },
  signOut: { color: "#2563eb", marginRight: 12 },
});
