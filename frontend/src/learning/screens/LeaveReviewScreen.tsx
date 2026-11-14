import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { makeStyles, useTheme } from "../../theme";
import { getMyReview, postReview, updateReview } from "@/services/reviewService";
import { notify } from "@/utils/alerts";
import i18n from "../../../i18n";

export default function LeaveReviewScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
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
        <ActivityIndicator color={colors.accent} />
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
              color={colors.star}
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
        placeholderTextColor={colors.textMuted}
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

const useStyles = makeStyles((t) => {
  const lc = t.colors.learning;
  return {
    container: { flex: 1, backgroundColor: lc.background, padding: t.spacing.lg },
    label: { color: lc.textSecondary, fontSize: t.typography.fontSize.sm, fontWeight: t.typography.fontWeight.semibold, marginTop: t.spacing.base, marginBottom: t.spacing.sm },
    stars: { flexDirection: "row", gap: t.spacing.sm },
    input: {
      backgroundColor: lc.input,
      color: lc.text,
      borderRadius: t.radius.card,
      padding: t.spacing.md,
      minHeight: 120,
      textAlignVertical: "top",
    },
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: t.spacing.sm },
    btn: { backgroundColor: lc.accent, borderRadius: t.radius.control, paddingVertical: t.spacing.base, alignItems: "center", marginTop: t.spacing.xl },
    btnText: { color: lc.onAccent, fontWeight: t.typography.fontWeight.bold, fontSize: t.typography.fontSize.md },
  };
});
