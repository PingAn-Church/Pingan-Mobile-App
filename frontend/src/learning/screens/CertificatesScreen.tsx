import React, { useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants";
import { getCertificates, type Certificate } from "@/services/certificateService";

export default function CertificatesScreen() {
  const navigation = useNavigation<any>();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["learning", "certificates"],
    queryFn: getCertificates,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const certificates = data ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Certificates</Text>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.secondary} />
      ) : isError ? (
        <Text style={styles.empty}>Could not load your certificates.</Text>
      ) : certificates.length === 0 ? (
        <Text style={styles.empty}>
          Complete a course to earn your first certificate.
        </Text>
      ) : (
        <FlatList
          data={certificates}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <CertificateCard cert={item} onPress={() => navigation.navigate("CertificateViewer", { certificate: item })} />}
        />
      )}
    </View>
  );
}

function CertificateCard({ cert, onPress }: { cert: Certificate; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.iconWrap}>
        <Ionicons name="ribbon" size={28} color={Colors.starGold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={2}>
          {cert.courseTitle}
        </Text>
        <Text style={styles.meta}>No. {cert.certificateNumber}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  heading: { fontSize: 26, fontWeight: "800", color: Colors.textPrimary, padding: 18 },
  list: { padding: 14, paddingBottom: 40 },
  empty: { color: Colors.textSecondary, textAlign: "center", marginTop: 40, paddingHorizontal: 30 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.backgroundGray,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: Colors.textPrimary, fontSize: 16, fontWeight: "700" },
  meta: { color: Colors.textSecondary, fontSize: 12, marginTop: 4 },
});
