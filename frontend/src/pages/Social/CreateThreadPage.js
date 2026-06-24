// src/pages/Social/CreateThreadPage.js
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
import { createThread } from "../../service/ThreadService";
import { useNavigation } from "@react-navigation/native";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { showAlert } from "../../utils/showAlert";

const CreateThreadPage = () => {
  const navigation = useNavigation();
  const { language } = useContext(LanguageContext);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // const handleSubmit = () => {
  //   if (!title.trim() || !content.trim()) {
  //     showAlert("Missing Fields", "Title and content are required.");
  //     return;
  //   }

  //   // Simulate thread creation (replace with real API call)
  //   console.log("New thread:", { title, content });

  //   // Navigate back to ThreadHomePage
  //   navigation.goBack();
  // };

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("createThread"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  const handleSubmit = async () => {
    if (submitting) return; // ignore repeat taps while posting
    if (!title.trim() || !content.trim()) {
      showAlert(i18n.t("error"), i18n.t("allFieldsRequired"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    setSubmitting(true);
    try {
      await createThread({ title, content });
      showAlert(i18n.t("success"), i18n.t("postThreadSuccess"), [
        { text: i18n.t("ok") },
      ]);
      navigation.goBack();
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("postThreadFailed"), [
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
      <Text style={styles.header}>{i18n.t("createNewThread")}</Text>

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

      <Button title={i18n.t("postThread")} onPress={handleSubmit} disabled={submitting} />
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
    lineHeight: 24,
  },
});

export default CreateThreadPage;
