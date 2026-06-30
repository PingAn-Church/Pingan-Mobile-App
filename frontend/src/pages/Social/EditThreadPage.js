// src/pages/Social/EditThreadPage.js

import React, { useState, useContext, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { updateThread } from "../../service/ThreadService";
import { useNavigation } from "@react-navigation/native";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { showAlert } from "../../utils/showAlert";


const EditThreadPage = ({ route }) => {
  const { thread } = route.params;
  const navigation = useNavigation();
  const { language } = useContext(LanguageContext);
  const [title, setTitle] = useState(thread.title);
  const [content, setContent] = useState(thread.content);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("editThread"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  const handleUpdate = async () => {
    if (submitting) return; // ignore repeat taps while saving
    if (!title.trim() || !content.trim()) {
      showAlert(i18n.t("error"), i18n.t("allFieldsRequired"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    setSubmitting(true);
    try {
      const updatedThread = await updateThread(thread.id, { title, content });
      showAlert(i18n.t("success"), i18n.t("updateThreadSuccess"), [
        { text: i18n.t("ok") },
      ]);
      navigation.navigate("ThreadDetail", { thread: updatedThread });
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("updateThreadFailed"), [
        { text: i18n.t("ok") },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: "padding", android: undefined })}
    >
      <Text style={styles.header}>{i18n.t("editThread")}</Text>

      <TextInput
        placeholder={i18n.t("threadTitle")}
        value={title}
        onChangeText={setTitle}
        style={styles.input}
      />

      <TextInput
        placeholder={i18n.t("threadContent")}
        value={content}
        onChangeText={setContent}
        style={[styles.input, { height: 120 }]}
        multiline
      />

      <Button title={i18n.t("save")} onPress={handleUpdate} disabled={submitting} />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 24,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 14,
    backgroundColor: "#f9f9f9",
    marginBottom: 20,
    fontSize: 16,
  },
});

export default EditThreadPage;
