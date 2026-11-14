import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { makeStyles, useTheme } from "../../theme";
import type { Certificate } from "@/services/certificateService";
import i18n from "../../../i18n";

export default function CertificateViewerScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const cert: Certificate | undefined = route.params?.certificate;

  useEffect(() => {
    navigation.setOptions({ title: i18n.t("certificate") });
  }, [navigation]);

  if (!cert) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>{i18n.t("certificateUnavailable")}</Text>
      </View>
    );
  }

  const issued = cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString() : "";

  return (
    <View style={[styles.container, styles.center]}>
      <View style={styles.cert}>
        <Ionicons name="ribbon" size={56} color={colors.star} />
        <Text style={styles.kicker}>{i18n.t("certificateOfCompletion")}</Text>
        <Text style={styles.label}>{i18n.t("certifiesThat")}</Text>
        <Text style={styles.name}>{cert.userName || i18n.t("learner")}</Text>
        <Text style={styles.label}>{i18n.t("hasCompleted")}</Text>
        <Text style={styles.course}>{cert.courseTitle}</Text>
        {!!issued && <Text style={styles.date}>{i18n.t("issuedOn", { date: issued })}</Text>}
        <View style={styles.divider} />
        <Text style={styles.number}>{i18n.t("certificateNo", { number: cert.certificateNumber })}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => {
  const lc = t.colors.learning;
  return {
    container: { flex: 1, backgroundColor: lc.background },
    center: { justifyContent: "center", alignItems: "center", padding: t.spacing.lg },
    muted: { color: lc.textSecondary },
    cert: {
      width: "100%",
      backgroundColor: lc.surface,
      borderRadius: t.radius.full,
      borderWidth: 2,
      borderColor: lc.star,
      padding: t.spacing["2xl"],
      alignItems: "center",
    },
    kicker: {
      color: lc.star,
      fontSize: t.typography.fontSize.lg,
      fontWeight: t.typography.fontWeight.bold,
      letterSpacing: 1,
      marginTop: t.spacing.md,
      marginBottom: t.spacing.lg,
      textTransform: "uppercase",
      textAlign: "center",
    },
    label: { color: lc.textSecondary, fontSize: t.typography.fontSize.sm, marginTop: t.spacing.md },
    name: { color: lc.text, fontSize: t.typography.fontSize["2xl"], fontWeight: t.typography.fontWeight.bold, marginTop: t.spacing.xs, textAlign: "center" },
    course: { color: lc.text, fontSize: t.typography.fontSize.xl, fontWeight: t.typography.fontWeight.bold, marginTop: t.spacing.xs, textAlign: "center" },
    date: { color: lc.textSecondary, fontSize: t.typography.fontSize.sm, marginTop: t.spacing.base },
    divider: { height: 1, backgroundColor: lc.surfaceAccent, alignSelf: "stretch", marginVertical: t.spacing.lg },
    number: { color: lc.textMuted, fontSize: t.typography.fontSize.xs, letterSpacing: 1 },
  };
});
