import { showAlert } from "../../utils/showAlert";
import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { startGroupChat } from "../../service/UserService";
import {
  getPresignedUploadUrl,
  uploadFileToOSS,
} from "../../service/OSSService";
import { UserContext } from "../../context/UserContext";
import { useNavigation } from "@react-navigation/native";
import useUserSearch from "../../hooks/useUserSearch";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { LanguageContext } from "../../context/LanguageContext";

const NewGroupScreen = () => {
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
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert(i18n.t("error"), i18n.t("needPhotoAccess"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
    try {
      let groupImageUrl = null;

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
          navigation.navigate("ChatHome");
          navigation.navigate("Chat", {
            conversationId: response.data.conversationId,
          });
        }
      } else {
        showAlert(i18n.t("error"), i18n.t("createGroupFailed"), [
          { text: i18n.t("ok") },
        ]);
      }
    } catch (error) {
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
      >
        <Text style={styles.userText}>
          {formatName(item.firstName, item.lastName)}
        </Text>
        {Platform.OS === "web" && (
          <View
            style={[
              styles.userSelectBox,
              isSelected ? styles.userSelectBoxChecked : null,
            ]}
          >
            {isSelected ? <Text style={styles.userSelectCheckmark}>✓</Text> : null}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>{i18n.t("createNewGroup")}</Text>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <TextInput
          style={styles.input}
          placeholder={i18n.t("groupName")}
          value={groupName}
          onChangeText={setGroupName}
        />

        {uploadingGroupImage ? (
          <ActivityIndicator
            size="large"
            color="#007aff"
            style={{ marginVertical: 10 }}
          />
        ) : (
          groupImage && (
            <Image source={{ uri: groupImage }} style={styles.image} />
          )
        )}

        <TouchableOpacity style={styles.imageButton} onPress={pickGroupImage}>
          <Text style={styles.imageButtonText}>{i18n.t("pickGroupImage")}</Text>
        </TouchableOpacity>

        <View style={styles.searchBar}>
          <TextInput
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
              <Text style={styles.emptyText}>{i18n.t("noUsersFound")}</Text>
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color="#007aff" style={{ marginVertical: 16 }} />
            ) : (
              <View style={styles.separator} />
            )
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          keyboardShouldPersistTaps="handled"
        />

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, submitting && { opacity: 0.6 }]}
            onPress={handleCreateGroup}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{i18n.t("createGroup")}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.buttonText}>{i18n.t("cancel")}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default NewGroupScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    fontSize: 20,
    fontWeight: "600",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  input: {
    height: 44,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    fontSize: 16,
  },
  imageButton: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: "#3b82f6",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  imageButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "500",
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginVertical: 12,
    alignSelf: "center", // ✅ centers the image horizontally
  },
  searchBar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  searchInput: {
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  emptyText: {
    textAlign: "center",
    color: "#9ca3af",
    marginTop: 24,
    fontSize: 15,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
  },
  userText: {
    fontSize: 16,
    color: "#1f2937",
  },
  separator: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginLeft: 0,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  button: {
    flex: 1,
    backgroundColor: "#007aff",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginHorizontal: 6,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 16,
  },
  userRowSelected: {
    backgroundColor: "#f0f8ff", // light blue background for selected
  },
  userSelectBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#C9CED8",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  userSelectBoxChecked: {
    backgroundColor: "#0A84FF",
    borderColor: "#0A84FF",
  },
  userSelectCheckmark: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 12,
  },
});
