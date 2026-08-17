// src/pages/Social/EditThreadPage.js

import React, { useState, useContext, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { updateThread } from "../../service/ThreadService";
import { useNavigation } from "@react-navigation/native";
import CachedImage from "../../components/CachedImage";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { showAlert } from "../../utils/showAlert";
import {
  discardThreadUpload,
  pickThreadImage,
  uploadThreadImage,
} from "../../utils/threadMedia";

const EditThreadPage = ({ route }) => {
  const { thread } = route.params;
  const navigation = useNavigation();
  const { language } = useContext(LanguageContext);
  const [title, setTitle] = useState(thread.title);
  const [content, setContent] = useState(thread.content);
  // Either the stored object path this thread already has, or a freshly picked
  // local file. uploadThreadImage returns the former untouched, so saving
  // without changing the picture re-uploads nothing.
  const [coverUri, setCoverUri] = useState(thread.coverImage || null);
  const [submitting, setSubmitting] = useState(false);

  const isNewlyPicked = !!coverUri && coverUri !== thread.coverImage;

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("editThread"),
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

  const handleUpdate = async () => {
    if (submitting) return; // ignore repeat taps while saving
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
      const updatedThread = await updateThread(thread.id, {
        title,
        content,
        // Empty string, not null: the server reads an absent cover as "the client
        // isn't talking about the picture" so that older builds, which never send
        // the field, stop wiping it. Clearing has to be said out loud.
        coverImage: uploadedCover || "",
      });
      showAlert(i18n.t("success"), i18n.t("updateThreadSuccess"), [
        { text: i18n.t("ok") },
      ]);
      navigation.navigate("ThreadDetail", { thread: updatedThread });
    } catch (error) {
      // Only a picture uploaded during THIS edit is an orphan worth removing;
      // the thread's existing one is still referenced by the unchanged row.
      if (isNewlyPicked) await discardThreadUpload(uploadedCover);
      showAlert(
        i18n.t("error"),
        error?.response?.status === 409
          ? i18n.t("contentUnderReview")
          : i18n.t("updateThreadFailed"),
        [{ text: i18n.t("ok") }]
      );
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

      {coverUri ? (
        <View style={styles.coverPreviewWrap}>
          <CachedImage
            uri={coverUri}
            type="thread"
            style={styles.coverPreview}
          />
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

      <Button title={i18n.t("save")} onPress={handleUpdate} disabled={submitting} />
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

export default EditThreadPage;
