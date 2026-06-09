import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Colors } from "@/constants";
import { getMyReview, postReview, updateReview } from "@/services/reviewService";

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
    navigation.setOptions({ title: "Leave a Review" });
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
      Alert.alert("Rating required", "Please choose a star rating.");
      return;
    }
    if (!text.trim()) {
      Alert.alert("Review required", "Please write a short review.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = { rating, review: text.trim(), isAnonymous: anonymous };
      if (editing) await updateReview(courseId, payload);
      else await postReview(courseId, payload);
      Alert.alert("Thank you", "Your review has been saved.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to submit review.");
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
      <Text style={styles.label}>Your rating</Text>
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

      <Text style={styles.label}>Your review</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Share what you thought about this course..."
        placeholderTextColor={Colors.textMuted}
        multiline
      />

      <View style={styles.switchRow}>
        <Text style={styles.label}>Post anonymously</Text>
        <Switch value={anonymous} onValueChange={setAnonymous} />
      </View>

      <TouchableOpacity style={styles.btn} onPress={submit} disabled={submitting}>
        <Text style={styles.btnText}>
          {submitting ? "Saving..." : editing ? "Update Review" : "Submit Review"}
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
