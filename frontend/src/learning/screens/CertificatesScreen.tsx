import React, { useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, useTheme } from "../../theme";
import { getCertificates, type Certificate } from "@/services/certificateService";
import i18n from "../../../i18n";

export default function CertificatesScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
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
      <Text style={styles.heading}>{i18n.t("certificates")}</Text>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: theme.spacing["3xl"] }} color={colors.accent} />
      ) : isError ? (
        <Text style={styles.empty}>{i18n.t("certificatesLoadFailed")}</Text>
      ) : certificates.length === 0 ? (
        <Text style={styles.empty}>
          {i18n.t("noCertificates")}
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
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.iconWrap}>
        <Ionicons name="ribbon" size={theme.sizes.icon.xl} color={colors.star} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={2}>
          {cert.courseTitle}
        </Text>
        <Text style={styles.meta}>{i18n.t("certificateNo", { number: cert.certificateNumber })}</Text>
      </View>
      <Ionicons name="chevron-forward" size={theme.sizes.icon.md} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((t) => {
  const lc = t.colors.learning;
  return {
    container: { flex: 1, backgroundColor: lc.background },
    heading: { fontSize: t.typography.fontSize["2xl"], fontWeight: t.typography.fontWeight.bold, color: lc.text, padding: t.spacing.lg },
    list: { padding: t.spacing.base, paddingBottom: t.spacing["3xl"] },
    empty: { color: lc.textSecondary, textAlign: "center", marginTop: t.spacing["3xl"], paddingHorizontal: t.spacing["2xl"] },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.spacing.base,
      backgroundColor: lc.surface,
      borderRadius: t.radius.card,
      padding: t.spacing.base,
      marginBottom: t.spacing.md,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: t.radius.full,
      backgroundColor: lc.surfaceAccent,
      alignItems: "center",
      justifyContent: "center",
    },
    title: { color: lc.text, fontSize: t.typography.fontSize.md, fontWeight: t.typography.fontWeight.bold },
    meta: { color: lc.textSecondary, fontSize: t.typography.fontSize.xs, marginTop: t.spacing.xs },
  };
});
