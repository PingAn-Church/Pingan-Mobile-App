// src/pages/Social/EditThreadPage.js

import React, { useState, useContext, useEffect } from "react";
import { View, TouchableOpacity } from "react-native";
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
import { makeStyles, useTheme } from "../../theme";
import { AppText, Button, Heading, TextField } from "../../components/ui";

const EditThreadPage = ({ route }) => {
  const { thread } = route.params;
  const styles = useStyles();
  const { colors, sizes, spacing } = useTheme();
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
      bottomOffset={spacing.xl}
      keyboardShouldPersistTaps="handled"
    >
      <Heading level={1} style={styles.header}>
        {i18n.t("editThread")}
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
          <CachedImage
            uri={coverUri}
            type="thread"
            style={styles.coverPreview}
          />
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
        title={i18n.t("save")}
        disabled={submitting}
        onPress={handleUpdate}
        style={styles.saveButton}
      />
    </KeyboardAwareScrollView>
  );
};

export default EditThreadPage;

// Layout only — text, inputs and buttons get their look from the ui components.
const CONTENT_HEIGHT = 120; // thread body box

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
  saveButton: {
    minHeight: 0,
    paddingVertical: t.spacing.sm,
  },
}));
