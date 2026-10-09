import React, { useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { createPoll } from "../../service/ChatService";
import { showAlert } from "../../utils/showAlert";
import { POLL_MULTI, POLL_SIGNUP, POLL_SINGLE, formatDeadline } from "../../utils/polls";

const MAX_OPTIONS = 10;

const animateLayout = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(200, "easeInEaseOut", "opacity"));

/**
 * Composes a poll or a sign-up sheet for a group chat. A screen of its own
 * rather than a page of the "+" panel: it has a question, a list of options and
 * several switches, and a bottom sheet fighting the keyboard over that much is
 * a worse experience than a plain form. Route params: conversationId,
 * conversationType, and mode "poll" | "signup".
 */
export default function PollComposerPage() {
  const navigation = useNavigation();
  const route = useRoute();
  const { language } = useContext(LanguageContext);
  const conversationId = route.params?.conversationId;
  const conversationType = route.params?.conversationType || "group";
  const isSignup = route.params?.mode === "signup";

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [maxEntries, setMaxEntries] = useState("");
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setMinutes(0, 0, 0);
    return d;
  });
  // Android has no combined picker: date first, then time.
  const [androidPicker, setAndroidPicker] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t(isSignup ? "createSignup" : "createPoll"),
      headerBackTitle: i18n.t("back"),
    });
  }, [navigation, isSignup, language]);

  const setOption = (index, text) =>
    setOptions((prev) => prev.map((value, i) => (i === index ? text : value)));
  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    animateLayout();
    setOptions((prev) => [...prev, ""]);
  };
  const removeOption = (index) => {
    if (options.length <= 2) return;
    animateLayout();
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const onDeadlineChange = (event, picked) => {
    if (Platform.OS === "android") {
      if (event?.type !== "set" || !picked) {
        setAndroidPicker(null);
        return;
      }
      if (androidPicker === "date") {
        const next = new Date(deadline);
        next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
        setDeadline(next);
        setAndroidPicker("time");
        return;
      }
      const next = new Date(deadline);
      next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      setDeadline(next);
      setAndroidPicker(null);
      return;
    }
    if (picked) setDeadline(picked);
  };

  const submit = async () => {
    if (submitting) return;
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      showAlert(i18n.t("error"), i18n.t("pollNeedsQuestion"));
      return;
    }
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!isSignup && cleanOptions.length < 2) {
      showAlert(i18n.t("error"), i18n.t("pollNeedsOptions"));
      return;
    }
    if (hasDeadline && deadline.getTime() <= Date.now()) {
      showAlert(i18n.t("error"), i18n.t("pollDeadlinePast"));
      return;
    }
    const limit = parseInt(maxEntries, 10);

    setSubmitting(true);
    try {
      await createPoll(conversationType, {
        conversationId,
        question: trimmedQuestion,
        mode: isSignup ? POLL_SIGNUP : allowMultiple ? POLL_MULTI : POLL_SINGLE,
        anonymous: !isSignup && anonymous,
        deadline: hasDeadline ? deadline.toISOString() : null,
        maxEntries: isSignup && Number.isFinite(limit) && limit > 0 ? limit : null,
        options: isSignup ? [] : cleanOptions,
      });
      navigation.goBack();
    } catch (error) {
      showAlert(
        i18n.t("error"),
        typeof error?.response?.data === "string" ? error.response.data : i18n.t("pollCreateFailed")
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAwareScrollView style={styles.container} bottomOffset={20} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>{i18n.t(isSignup ? "signupTopic" : "pollQuestion")}</Text>
      <TextInput
        style={[styles.input, styles.questionInput]}
        value={question}
        onChangeText={setQuestion}
        placeholder={i18n.t(isSignup ? "signupTopicPlaceholder" : "pollQuestionPlaceholder")}
        placeholderTextColor="#98989D"
        multiline
        maxLength={300}
      />

      {!isSignup && (
        <>
          <Text style={styles.label}>{i18n.t("pollOptions")}</Text>
          {options.map((value, index) => (
            <View key={index} style={styles.optionRow}>
              <TextInput
                style={[styles.input, styles.optionInput]}
                value={value}
                onChangeText={(text) => setOption(index, text)}
                placeholder={i18n.t("optionPlaceholder", { n: index + 1 })}
                placeholderTextColor="#98989D"
                maxLength={200}
              />
              <TouchableOpacity
                onPress={() => removeOption(index)}
                disabled={options.length <= 2}
                hitSlop={8}
                style={styles.removeOption}
                accessibilityLabel={i18n.t("delete")}
              >
                <Ionicons
                  name="remove-circle"
                  size={22}
                  color={options.length <= 2 ? "#D1D1D6" : "#FF3B30"}
                />
              </TouchableOpacity>
            </View>
          ))}
          {options.length < MAX_OPTIONS && (
            <TouchableOpacity onPress={addOption} style={styles.addOption}>
              <Ionicons name="add-circle-outline" size={20} color="#0A84FF" />
              <Text style={styles.addOptionText}>{i18n.t("addOption")}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{i18n.t("allowMultiple")}</Text>
            <Switch value={allowMultiple} onValueChange={setAllowMultiple} />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>{i18n.t("anonymousPoll")}</Text>
              <Text style={styles.hint}>{i18n.t("anonymousPollHint")}</Text>
            </View>
            <Switch value={anonymous} onValueChange={setAnonymous} />
          </View>
        </>
      )}

      {isSignup && (
        <>
          <Text style={styles.label}>{i18n.t("maxEntries")}</Text>
          <TextInput
            style={styles.input}
            value={maxEntries}
            onChangeText={(text) => setMaxEntries(text.replace(/[^0-9]/g, ""))}
            placeholder={i18n.t("maxEntriesHint")}
            placeholderTextColor="#98989D"
            keyboardType="number-pad"
            maxLength={4}
          />
        </>
      )}

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{i18n.t("setDeadline")}</Text>
        <Switch
          value={hasDeadline}
          onValueChange={(value) => {
            animateLayout();
            setHasDeadline(value);
          }}
        />
      </View>
      {hasDeadline && (
        <View style={styles.deadlineBox}>
          {Platform.OS === "web" ? (
            <input
              type="datetime-local"
              value={new Date(deadline.getTime() - deadline.getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16)}
              onChange={(e) => e.target.value && setDeadline(new Date(e.target.value))}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", fontSize: 16 }}
            />
          ) : Platform.OS === "ios" ? (
            <DateTimePicker
              value={deadline}
              mode="datetime"
              display="spinner"
              minimumDate={new Date()}
              onChange={onDeadlineChange}
              style={styles.iosPicker}
            />
          ) : (
            <>
              <TouchableOpacity style={styles.deadlineButton} onPress={() => setAndroidPicker("date")}>
                <Ionicons name="calendar-outline" size={20} color="#3C3C43" />
                <Text style={styles.deadlineText}>{formatDeadline(deadline.getTime(), language)}</Text>
              </TouchableOpacity>
              {androidPicker && (
                <DateTimePicker
                  value={deadline}
                  mode={androidPicker}
                  display="default"
                  minimumDate={androidPicker === "date" ? new Date() : undefined}
                  onChange={onDeadlineChange}
                />
              )}
            </>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.submit, submitting && { opacity: 0.6 }]}
        onPress={submit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.submitText}>{i18n.t(isSignup ? "createSignup" : "createPoll")}</Text>
        )}
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#F2F2F7",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B6B70",
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D1D6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#111113",
  },
  questionInput: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  optionInput: {
    flex: 1,
  },
  removeOption: {
    marginLeft: 8,
  },
  addOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  addOptionText: {
    fontSize: 15,
    color: "#0A84FF",
    fontWeight: "600",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  switchText: {
    flex: 1,
    paddingRight: 12,
  },
  switchLabel: {
    fontSize: 16,
    color: "#111113",
  },
  hint: {
    fontSize: 13,
    color: "#8E8E93",
    marginTop: 2,
  },
  deadlineBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    marginTop: 8,
    padding: 8,
  },
  iosPicker: {
    alignSelf: "stretch",
  },
  deadlineButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
  },
  deadlineText: {
    fontSize: 16,
    color: "#111113",
  },
  submit: {
    marginTop: 26,
    marginBottom: 30,
    backgroundColor: "#0A84FF",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
});
