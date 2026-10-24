import { showAlert } from "../../utils/showAlert";
import React, { useContext, useEffect, useState } from "react";
import {
  View,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { startGroupChat } from "../../service/UserService";
import {
  getPresignedUploadUrl,
  uploadFileToOSS,
  deleteOwnUpload,
} from "../../service/OSSService";
import { UserContext } from "../../context/UserContext";
import { useNavigation } from "@react-navigation/native";
import useUserSearch from "../../hooks/useUserSearch";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { LanguageContext } from "../../context/LanguageContext";
import { makeStyles, useTheme } from "../../theme";
import { AppText, Button, Heading, TextField } from "../../components/ui";

const NewGroupScreen = () => {
  const styles = useStyles();
  const { colors, sizes } = useTheme();
  const [groupName, setGroupName] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [groupImage, setGroupImage] = useState(null);
  const [uploadingGroupImage, setUploadingGroupImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useContext(UserContext);
  const { language } = useContext(LanguageContext);
  const navigation = useNavigation();
  const { query, setQuery, results, loading, loadingMore, hasMore, loadMore } =
    useUserSearch({ excludeId: user?.id });

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("newGroup"),
    });
  }, [language]);

  const pickGroupImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setGroupImage(result.assets[0].uri);
    }
  };

  const uploadGroupImageUsingPresignedUrl = async (groupName) => {
    if (!groupImage) return null;

    try {
      setUploadingGroupImage(true);
      const sanitizedGroupName = groupName.replace(/[^a-zA-Z0-9]/g, "_");
      const timestamp = Date.now();
      const fileName = `group_${sanitizedGroupName}_${timestamp}.jpg`;

      const presignedUploadUrl = await getPresignedUploadUrl(fileName, "group");
      const uploadedFileUrl = await uploadFileToOSS(
        groupImage,
        presignedUploadUrl
      );

      setUploadingGroupImage(false);
      return uploadedFileUrl;
    } catch (error) {
      console.error("Error uploading group image:", error);
      setUploadingGroupImage(false);
      showAlert(i18n.t("error"), i18n.t("imageUploadFailed"), [
        { text: i18n.t("ok") },
      ]);
      return null;
    }
  };

  const handleCreateGroup = async () => {
    if (submitting) return; // ignore repeat taps while creating
    if (!groupName || selectedParticipants.length === 0) {
      showAlert(i18n.t("error"), i18n.t("createGroupRequirement"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    setSubmitting(true);
    let groupImageUrl = null;
    try {
      if (groupImage) {
        groupImageUrl = await uploadGroupImageUsingPresignedUrl(groupName);
        if (!groupImageUrl) throw new Error(i18n.t("imageUploadFailed"));
      }

      const response = await startGroupChat({
        groupName,
        participants: selectedParticipants.map((u) => u.id),
        conversationType: "group",
        groupIcon: groupImageUrl,
      });

      if (response.status === 200) {
        // navigation.reset({
        //   index: 1,
        //   routes: [
        //     { name: "ChatHome" },
        //     { name: "Chat", params: { conversationId: response.data.conversationId } },
        //   ],
        // });
        if (response.status === 200) {
          navigation.navigate("HomeTabs", { screen: "Chats" });
          navigation.navigate("Chat", {
            conversationId: response.data.conversationId,
          });
        }
      } else {
        throw new Error(i18n.t("createGroupFailed"));
      }
    } catch (error) {
      if (groupImageUrl) {
        try {
          await deleteOwnUpload(groupImageUrl, "group");
        } catch (cleanupError) {
          if (cleanupError?.response?.status !== 409) {
            console.warn("Failed to clean up unreferenced group icon:", cleanupError);
          }
        }
      }
      showAlert(
        i18n.t("error"),
        error.message || i18n.t("somethingWentWrong"),
        [{ text: i18n.t("ok") }]
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderUser = ({ item }) => {
    const isSelected = selectedParticipants.some((u) => u.id === item.id);
    return (
      <TouchableOpacity
        onPress={() => {
          if (isSelected) {
            setSelectedParticipants(
              selectedParticipants.filter((u) => u.id !== item.id)
            );
          } else {
            setSelectedParticipants([...selectedParticipants, item]);
          }
        }}
        style={[
          styles.userRow,
          isSelected && styles.userRowSelected, // 👈 conditional highlight
        ]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
      >
        <AppText variant="body" color="textPrimary">
          {formatName(item.firstName, item.lastName)}
        </AppText>
        {Platform.OS === "web" && (
          <View
            style={[
              styles.userSelectBox,
              isSelected ? styles.userSelectBoxChecked : null,
            ]}
          >
            {isSelected ? (
              <Ionicons name="checkmark" size={sizes.icon.xs} color={colors.onPrimary} />
            ) : null}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Heading level={2} style={styles.header}>
        {i18n.t("createNewGroup")}
      </Heading>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardArea}
      >
        <TextField
          style={styles.input}
          placeholder={i18n.t("groupName")}
          value={groupName}
          onChangeText={setGroupName}
        />

        {uploadingGroupImage ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={styles.uploading}
          />
        ) : (
          groupImage && (
            <Image source={{ uri: groupImage }} style={styles.image} />
          )
        )}

        <Button
          size="md"
          title={i18n.t("pickGroupImage")}
          onPress={pickGroupImage}
          style={styles.imageButton}
        />

        <View style={styles.searchBar}>
          <TextField
            style={styles.searchInput}
            placeholder={i18n.t("searchUsers")}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>

        <FlatList
          data={results}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderUser}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            loading ? null : (
              <AppText variant="secondary" style={styles.emptyText}>
                {i18n.t("noUsersFound")}
              </AppText>
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.primary} style={styles.loadingMore} />
            ) : (
              <View style={styles.separator} />
            )
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          keyboardShouldPersistTaps="handled"
        />

        <View style={styles.buttonRow}>
          <Button
            size="md"
            fullWidth={false}
            title={i18n.t("createGroup")}
            disabled={submitting}
            onPress={handleCreateGroup}
            style={styles.rowButton}
          />
          <Button
            variant="neutral"
            size="md"
            fullWidth={false}
            title={i18n.t("cancel")}
            onPress={() => navigation.goBack()}
            style={styles.rowButton}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default NewGroupScreen;

const PREVIEW_SIZE = 100; // picked group photo
const CHECKBOX_SIZE = 20; // web-only select box on each person

const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  header: {
    paddingVertical: t.spacing.base,
    paddingHorizontal: t.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  keyboardArea: {
    flex: 1,
  },
  input: {
    // minHeight, not height: a fixed box clips the text at large system fonts.
    minHeight: t.sizes.minTouchTarget,
    marginHorizontal: t.spacing.lg,
    marginTop: t.spacing.md,
    marginBottom: t.spacing.sm,
  },
  uploading: {
    marginVertical: t.spacing.sm,
  },
  image: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: t.radius.card,
    marginVertical: t.spacing.md,
    alignSelf: "center", // ✅ centers the image horizontally
  },
  imageButton: {
    marginHorizontal: t.spacing.lg,
    marginBottom: t.spacing.sm,
  },
  searchBar: {
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
  },
  searchInput: {
    backgroundColor: t.colors.inputFilled,
    borderWidth: 0,
    borderRadius: t.radius.card,
    paddingHorizontal: t.spacing.md,
  },
  emptyText: {
    textAlign: "center",
    marginTop: t.spacing.xl,
  },
  loadingMore: {
    marginVertical: t.spacing.base,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: t.spacing.base,
    paddingHorizontal: t.spacing.lg,
    backgroundColor: t.colors.surface,
  },
  userRowSelected: {
    backgroundColor: t.colors.surfaceSelected,
  },
  separator: {
    height: 1,
    backgroundColor: t.colors.borderSubtle,
    marginLeft: 0,
  },
  buttonRow: {
    flexDirection: "row",
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.lg,
  },
  rowButton: {
    flex: 1,
  },
  userSelectBox: {
    width: CHECKBOX_SIZE,
    height: CHECKBOX_SIZE,
    borderRadius: t.radius.control,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: t.spacing.sm,
  },
  userSelectBoxChecked: {
    backgroundColor: t.colors.primary,
    borderColor: t.colors.primary,
  },
}));
