import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants";
import { useAuth } from "@/context/AuthContext";
import apiService from "@/services/apiService";

/**
 * Placeholder learning landing screen used to verify the module scaffolding
 * (TypeScript, `@` alias, React Query, the repointed API client and the auth
 * bridge). Real catalog browsing replaces this in P2.
 */
export default function LearningHomeScreen() {
  const { user } = useAuth();

  const ping = useQuery({
    queryKey: ["learning", "ping"],
    queryFn: () => apiService.get<{ success: boolean; message: string }>("/ping"),
    retry: false,
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Learning</Text>
      <Text style={styles.subtitle}>
        {user ? `Signed in as ${user.name} (${user.role})` : "Not signed in"}
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Backend connectivity</Text>
        {ping.isLoading ? (
          <ActivityIndicator color={Colors.secondary} />
        ) : ping.isError ? (
          <Text style={styles.error}>{(ping.error as Error)?.message || "Ping failed"}</Text>
        ) : (
          <Text style={styles.ok}>{ping.data?.message || "ok"}</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, backgroundColor: Colors.primary, flexGrow: 1 },
  title: { fontSize: 28, fontWeight: "700", color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary },
  card: {
    backgroundColor: Colors.backgroundGray,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: Colors.textPrimary, marginBottom: 8 },
  ok: { color: Colors.green },
  error: { color: Colors.red },
});
