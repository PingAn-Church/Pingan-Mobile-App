import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants";
import i18n from "../../../../i18n";

export interface MatchPair {
  left: string;
  right: string;
}

interface Props {
  /** Prompts to match from (left column, fixed order). */
  left: string[];
  /** Choices to match to (right column, pre-shuffled by the backend). */
  right: string[];
  /** Current answer as left→right pairs. */
  value: MatchPair[];
  onChange: (pairs: MatchPair[]) => void;
}

/**
 * Tap-to-connect matching input. Tap a left prompt to select it, then tap a
 * right choice to pair them; tap a matched left prompt to clear it. Pairings
 * are one-to-one. Emits the `[{ left, right }]` shape the backend grades.
 */
export default function MatchingQuestion({ left, right, value, onChange }: Props) {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);

  const matches = useMemo(() => {
    const m = new Map<string, string>();
    (Array.isArray(value) ? value : []).forEach((p) => m.set(p.left, p.right));
    return m;
  }, [value]);

  const emit = (m: Map<string, string>) =>
    onChange(Array.from(m.entries()).map(([l, r]) => ({ left: l, right: r })));

  const tapLeft = (item: string) => {
    if (matches.has(item)) {
      const m = new Map(matches);
      m.delete(item);
      emit(m);
      if (selectedLeft === item) setSelectedLeft(null);
      return;
    }
    setSelectedLeft((prev) => (prev === item ? null : item));
  };

  const tapRight = (item: string) => {
    if (!selectedLeft) return;
    const m = new Map(matches);
    // Keep pairings one-to-one: drop any left already pointing at this choice.
    for (const [l, r] of m) if (r === item) m.delete(l);
    m.set(selectedLeft, item);
    emit(m);
    setSelectedLeft(null);
  };

  const rightTakenBy = (item: string): string | null => {
    for (const [l, r] of matches) if (r === item) return l;
    return null;
  };

  return (
    <View>
      <Text style={styles.hint}>
        {selectedLeft ? i18n.t("matchTapRight") : i18n.t("matchTapLeft")}
      </Text>
      <View style={styles.row}>
        <View style={styles.col}>
          {left.map((item) => {
            const matched = matches.get(item);
            const active = selectedLeft === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.pill, active && styles.pillActive, !!matched && styles.pillMatched]}
                onPress={() => tapLeft(item)}
              >
                <Text style={styles.pillText}>{item}</Text>
                {matched ? (
                  <View style={styles.matchTag}>
                    <Text style={styles.matchTagText} numberOfLines={1}>
                      {matched}
                    </Text>
                    <Ionicons name="close-circle" size={15} color={Colors.textSecondary} />
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.col}>
          {right.map((item) => {
            const takenBy = rightTakenBy(item);
            const ready = !!selectedLeft && !takenBy;
            return (
              <TouchableOpacity
                key={item}
                style={[
                  styles.pill,
                  styles.pillRight,
                  !!takenBy && styles.pillTaken,
                  ready && styles.pillReady,
                ]}
                onPress={() => tapRight(item)}
                disabled={!!takenBy || !selectedLeft}
              >
                <Text style={styles.pillText}>{item}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { color: Colors.textSecondary, fontSize: 12, marginBottom: 10 },
  row: { flexDirection: "row", gap: 10 },
  col: { flex: 1, gap: 8 },
  pill: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  pillRight: { backgroundColor: Colors.textInputBg },
  pillActive: { borderColor: Colors.secondary },
  pillMatched: { borderColor: Colors.green },
  pillReady: { borderColor: Colors.blue },
  pillTaken: { opacity: 0.45 },
  pillText: { color: Colors.textPrimary, fontSize: 14, fontWeight: "600" },
  matchTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  matchTagText: { color: Colors.textSecondary, fontSize: 12, flexShrink: 1 },
});
