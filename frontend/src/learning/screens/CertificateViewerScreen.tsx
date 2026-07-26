import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Colors } from "@/constants";
import type { Certificate } from "@/services/certificateService";
import i18n from "../../../i18n";

export default function CertificateViewerScreen() {
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
        <Ionicons name="ribbon" size={56} color={Colors.starGold} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  center: { justifyContent: "center", alignItems: "center", padding: 20 },
  muted: { color: Colors.textSecondary },
  cert: {
    width: "100%",
    backgroundColor: Colors.backgroundGray,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.starGold,
    padding: 28,
    alignItems: "center",
  },
  kicker: {
    color: Colors.starGold,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 18,
    textTransform: "uppercase",
    textAlign: "center",
  },
  label: { color: Colors.textSecondary, fontSize: 13, marginTop: 10 },
  name: { color: Colors.textPrimary, fontSize: 24, fontWeight: "800", marginTop: 4, textAlign: "center" },
  course: { color: Colors.textPrimary, fontSize: 20, fontWeight: "700", marginTop: 4, textAlign: "center" },
  date: { color: Colors.textSecondary, fontSize: 13, marginTop: 16 },
  divider: { height: 1, backgroundColor: Colors.surface, alignSelf: "stretch", marginVertical: 18 },
  number: { color: Colors.textMuted, fontSize: 12, letterSpacing: 1 },
});
