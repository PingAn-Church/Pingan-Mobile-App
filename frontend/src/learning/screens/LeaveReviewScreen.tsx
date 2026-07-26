import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Colors } from "@/constants";
import { getMyReview, postReview, updateReview } from "@/services/reviewService";
import { notify } from "@/utils/alerts";
import i18n from "../../../i18n";

export default function LeaveReviewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const courseId = String(route.params?.courseId ?? "");

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: i18n.t("leaveReview") });
    (async () => {
      try {
        const existing = await getMyReview(courseId);
        if (existing) {
          setEditing(true);
          setRating(existing.rating);
          setText(existing.review);
          setAnonymous(existing.isAnonymous);
        }
      } catch {}
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (rating < 1) {
      notify(i18n.t("ratingRequired"), i18n.t("chooseStarRating"));
      return;
    }
    if (!text.trim()) {
      notify(i18n.t("reviewRequired"), i18n.t("writeShortReview"));
      return;
    }
    setSubmitting(true);
    try {
      const payload = { rating, review: text.trim(), isAnonymous: anonymous };
      if (editing) await updateReview(courseId, payload);
      else await postReview(courseId, payload);
      notify(i18n.t("thankYou"), i18n.t("reviewSaved"), () => navigation.goBack());
    } catch (e: any) {
      notify(
        i18n.t("error"),
        e?.status === 409 || e?.statusCode === 409
          ? i18n.t("contentUnderReview")
          : e?.message || i18n.t("reviewSubmitFailed")
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator color={Colors.secondary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{i18n.t("yourRating")}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((s) => (
          <TouchableOpacity key={s} onPress={() => setRating(s)}>
            <Ionicons
              name={s <= rating ? "star" : "star-outline"}
              size={36}
              color={Colors.starGold}
            />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{i18n.t("yourReview")}</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={i18n.t("reviewPlaceholder")}
        placeholderTextColor={Colors.textMuted}
        multiline
      />

      <View style={styles.switchRow}>
        <Text style={styles.label}>{i18n.t("postAnonymously")}</Text>
        <Switch value={anonymous} onValueChange={setAnonymous} />
      </View>

      <TouchableOpacity style={styles.btn} onPress={submit} disabled={submitting}>
        <Text style={styles.btnText}>
          {submitting ? i18n.t("saving") : editing ? i18n.t("updateReview") : i18n.t("submitReview")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, padding: 18 },
  label: { color: Colors.textSecondary, fontSize: 14, fontWeight: "600", marginTop: 14, marginBottom: 8 },
  stars: { flexDirection: "row", gap: 8 },
  input: {
    backgroundColor: Colors.textInputBg,
    color: Colors.textPrimary,
    borderRadius: 10,
    padding: 12,
    minHeight: 120,
    textAlignVertical: "top",
  },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  btn: { backgroundColor: Colors.secondary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 24 },
  btnText: { color: Colors.white, fontWeight: "700", fontSize: 16 },
});
