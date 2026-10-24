// src/pages/Social/CreateThreadPage.js
import React, { useState, useContext, useEffect } from "react";
import { View, Image, TouchableOpacity } from "react-native";
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
import { makeStyles, useTheme } from "../../theme";
import { AppText, Button, Heading, TextField } from "../../components/ui";

const CreateThreadPage = () => {
  const styles = useStyles();
  const { colors, sizes, spacing } = useTheme();
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
      bottomOffset={spacing.xl}
      keyboardShouldPersistTaps="handled"
    >
      <Heading level={1} style={styles.header}>
        {i18n.t("createNewThread")}
      </Heading>

      <TextField
        placeholder={i18n.t("threadTitle")}
        value={title}
        onChangeText={setTitle}
        style={styles.input}
      />

      <TextField
        placeholder={i18n.t("threadContent")}
        value={content}
        onChangeText={setContent}
        style={[styles.input, styles.contentInput]}
        multiline
      />

      {coverUri ? (
        <View style={styles.coverPreviewWrap}>
          <Image source={{ uri: coverUri }} style={styles.coverPreview} />
          <TouchableOpacity
            style={styles.coverRemove}
            onPress={() => setCoverUri(null)}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("removeCoverImage")}
          >
            <Ionicons name="close" size={sizes.icon.sm} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.coverButton}
        onPress={handlePickCover}
        accessibilityRole="button"
      >
        <Ionicons name="image-outline" size={sizes.icon.md} color={colors.primary} />
        <AppText
          variant="button"
          color="primary"
          weight="semibold"
          size="md"
        >
          {coverUri ? i18n.t("changeCoverImage") : i18n.t("addCoverImage")}
        </AppText>
      </TouchableOpacity>

      <Button
        size="sm"
        title={i18n.t("postThread")}
        disabled={submitting}
        onPress={handleSubmit}
        style={styles.postButton}
      />
    </KeyboardAwareScrollView>
  );
};

export default CreateThreadPage;

const CONTENT_HEIGHT = 120; 

const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    padding: t.spacing.lg,
    paddingBottom: t.spacing["3xl"],
  },
  header: {
    marginBottom: t.spacing.xl,
    textAlign: "center",
  },
  input: {
    backgroundColor: t.colors.inputFilled,
    borderRadius: t.radius.card,
    padding: t.spacing.base,
    marginBottom: t.spacing.lg,
  },
  contentInput: {
    height: CONTENT_HEIGHT,
  },
  coverPreviewWrap: {
    marginBottom: t.spacing.md,
  },
  coverPreview: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.placeholder,
  },
  coverRemove: {
    position: "absolute",
    top: t.spacing.sm,
    right: t.spacing.sm,
    backgroundColor: t.colors.overlay,
    borderRadius: t.radius.full,
    padding: t.spacing.xs,
  },
  coverButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: t.spacing.sm,
    borderWidth: 1,
    borderColor: t.colors.borderTinted,
    backgroundColor: t.colors.surfaceTinted,
    borderRadius: t.radius.card,
    paddingVertical: t.spacing.md,
    marginBottom: t.spacing.lg,
  },
  postButton: {
    minHeight: 0,
    paddingVertical: t.spacing.sm,
  },
}));
