// src/pages/Social/CreateThreadPage.js
import React, { useState, useContext, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  Image,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { createThread } from "../../service/ThreadService";
import { useNavigation } from "@react-navigation/native";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { showAlert } from "../../utils/showAlert";
import {
  discardThreadUpload,
  pickThreadImage,
  uploadThreadImage,
} from "../../utils/threadMedia";

const CreateThreadPage = () => {
  const navigation = useNavigation();
  const { language } = useContext(LanguageContext);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  // Local file only. It does not reach OSS until the thread is actually posted,
  // so backing out here leaves nothing behind to clean up.
  const [coverUri, setCoverUri] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("createThread"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  const handlePickCover = async () => {
    try {
      const uri = await pickThreadImage({ allowsEditing: true });
      if (uri) setCoverUri(uri);
    } catch (error) {
      console.error("Failed to pick a cover image:", error);
    }
  };

  const handleSubmit = async () => {
    if (submitting) return; // ignore repeat taps while posting
    if (!title.trim() || !content.trim()) {
      showAlert(i18n.t("error"), i18n.t("allFieldsRequired"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    setSubmitting(true);
    let uploadedCover = null;
    try {
      uploadedCover = await uploadThreadImage(coverUri);
      await createThread({ title, content, coverImage: uploadedCover });
      showAlert(i18n.t("success"), i18n.t("postThreadSuccess"), [
        { text: i18n.t("ok") },
      ]);
      navigation.goBack();
    } catch (error) {
      // The picture uploaded but the thread didn't save — drop the orphan
      // rather than leaving it paid for and unreferenced.
      await discardThreadUpload(uploadedCover);
      showAlert(i18n.t("error"), i18n.t("postThreadFailed"), [
        { text: i18n.t("ok") },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
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

      {coverUri ? (
        <View style={styles.coverPreviewWrap}>
          <Image source={{ uri: coverUri }} style={styles.coverPreview} />
          <TouchableOpacity style={styles.coverRemove} onPress={() => setCoverUri(null)}>
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity style={styles.coverButton} onPress={handlePickCover}>
        <Ionicons name="image-outline" size={20} color="#007aff" />
        <Text style={styles.coverButtonText}>
          {coverUri ? i18n.t("changeCoverImage") : i18n.t("addCoverImage")}
        </Text>
      </TouchableOpacity>

      <Button title={i18n.t("postThread")} onPress={handleSubmit} disabled={submitting} />
    </KeyboardAwareScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 40 },
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
  coverPreviewWrap: { marginBottom: 14 },
  coverPreview: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: "#eee",
  },
  coverRemove: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 14,
    padding: 5,
  },
  coverButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#cfe2ff",
    backgroundColor: "#f2f7ff",
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 20,
  },
  coverButtonText: { color: "#007aff", fontWeight: "600", fontSize: 15 },
});

export default CreateThreadPage;
