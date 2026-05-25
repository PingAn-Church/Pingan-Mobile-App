import React, { useContext, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  TextInput,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import {
  getAllAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
} from "../../service/AnnouncementService";
import {
  fetchPictures,
  getPresignedUploadUrl,
  uploadFileToOSS,
  deletePicture,
} from "../../service/OSSService";
import { confirmAction } from "../../utils/confirmAction";
import { showAlert } from "../../utils/showAlert";
import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";

export default function ManageAnnouncementsPage() {
  const navigation = useNavigation();
  const [announcements, setAnnouncements] = useState([]);
  const [pictures, setPictures] = useState([]);
  const { language } = useContext(LanguageContext);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("manageAnnouncements"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  useFocusEffect(
    useCallback(() => {
      loadAnnouncements();
      loadPictures();
    }, [])
  );

  const loadAnnouncements = async () => {
    try {
      const data = await getAllAnnouncements();
      console.log("Announcements:", data);
      setAnnouncements(data);
    } catch (error) {
      console.error("Error fetching announcements:", error);
    }
  };

  const loadPictures = async () => {
    try {
      const data = await fetchPictures("announcement");
      console.log("Pictures:", data);
      setPictures(data);
    } catch (error) {
      console.error("Error fetching pictures:", error);
    }
  };

  // Map each announcement to its respective image
  const getImageForAnnouncement = (announcement) => {
    const matchedImage = pictures.find((pic) =>
      pic.includes(announcement.imageUrl.split("/").pop())
    );
    return matchedImage || null;
  };

  const handleDeleteAnnouncement = async (announcement) => {
    const confirmed = await confirmAction({
      title: i18n.t("deleteAnnouncement"),
      message: i18n.t("areYouSure"),
      confirmText: i18n.t("delete"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });

    if (!confirmed) return;

    try {
      const fileName = announcement.imageUrl.split("/").pop().split("?")[0];

      // Delete image from OSS
      await deletePicture(fileName, "announcement");

      // Delete announcement from database
      await deleteAnnouncement(announcement.id);

      // Update UI
      setAnnouncements(announcements.filter((a) => a.id !== announcement.id));
      setPictures(pictures.filter((p) => !p.includes(fileName)));
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("deleteAnnouncementFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={announcements}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.announcementContainer}>
            <Image
              source={{ uri: getImageForAnnouncement(item) }}
              style={styles.image}
            />
            <Text style={styles.title}>{item.title}</Text>
            <TouchableOpacity onPress={() => handleDeleteAnnouncement(item)}>
              <MaterialIcons name="delete" size={24} color="red" />
            </TouchableOpacity>
          </View>
        )}
      />

      {announcements.length < 10 ? (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate("AddAnnouncement")}
        >
          <Text style={styles.addButtonText}>
            + {i18n.t("addAnnouncement")}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.addButtonDisabled} disabled={true}>
          <Text style={styles.addButtonText}>
            {i18n.t("announcementLimit")}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function AddAnnouncementPage() {
  const navigation = useNavigation();
  const [title, setTitle] = useState("");
  const [announcementLink, setAnnouncementLink] = useState("");
  const [image, setImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  const isValidHttpUrl = (value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

  const handleChooseImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [6, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets.length > 0) {
      setImage(result.assets[0].uri);
    }
  };

  const handleUpload = async () => {
    const trimmedTitle = title.trim();
    const trimmedLink = announcementLink.trim();

    if (!trimmedTitle || !image) {
      showAlert(i18n.t("error"), i18n.t("fillTitleAndImage"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    if (trimmedTitle.length > 70) {
      showAlert(i18n.t("error"), i18n.t("titleLessThan70"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    if (trimmedLink && !isValidHttpUrl(trimmedLink)) {
      showAlert(i18n.t("error"), i18n.t("invalidAnnouncementLink"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    setUploading(true);
    try {
      const fileName = `announcement_${Date.now()}.jpeg`;

      // Get Presigned URL
      const presignedUrl = await getPresignedUploadUrl(
        fileName,
        "announcement"
      );

      // Upload Image to OSS
      const uploadedImageUrl = await uploadFileToOSS(image, presignedUrl);

      // Save Announcement in DB
      await createAnnouncement(trimmedTitle, uploadedImageUrl, trimmedLink);

      showAlert(i18n.t("success"), i18n.t("addAnnouncementSuccess"), [
        { text: i18n.t("ok") },
      ]);
      navigation.goBack();
    } catch (error) {
      console.error("Error adding announcement:", error);
      const backendMessage =
        error?.response?.data?.message ||
        (typeof error?.response?.data === "string" ? error.response.data : "");
      const failureMessage = backendMessage || error?.message || i18n.t("addAnnouncementFailed");
      showAlert(i18n.t("error"), failureMessage, [
        { text: i18n.t("ok") },
      ]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{i18n.t("addAnnouncement")}</Text>
      <TextInput
        style={styles.input}
        placeholder={i18n.t("enterAnnouncementTitle")}
        value={title}
        multiline={true}
        numberOfLines={2}
        textAlignVertical="top"
        onChangeText={setTitle}
      />
      <Text style={{ marginBottom: 10, marginLeft: 5 }}>{title.length}/70</Text>

      <TextInput
        style={styles.input}
        placeholder={i18n.t("enterAnnoucementLink")}
        value={announcementLink}
        multiline={false}
        numberOfLines={1}
        textAlignVertical="top"
        onChangeText={setAnnouncementLink}
      />

      <TouchableOpacity style={styles.imagePicker} onPress={handleChooseImage}>
        <Text style={styles.imagePickerText}>
          {image ? i18n.t("changeImage") : i18n.t("chooseImage")}
        </Text>
      </TouchableOpacity>

      {image && <Image source={{ uri: image }} style={styles.previewImage} />}

      <TouchableOpacity
        style={[styles.addButton, uploading && styles.addButtonDisabled]}
        onPress={handleUpload}
        disabled={uploading}
      >
        <Text style={styles.addButtonText}>
          {uploading ? i18n.t("uploading") : i18n.t("uploadAnnouncement")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  header: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  announcementContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f8f8",
    padding: 10,
    marginBottom: 10,
    borderRadius: 8,
    elevation: 2,
  },
  image: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 10,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    marginRight: 2,
    lineHeight: 24,
  },
  addButton: {
    backgroundColor: "#007BFF",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 40,
    marginBottom: 20,
  },
  addButtonDisabled: {
    backgroundColor: "#ccc",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 40,
    marginBottom: 20,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  input: {
    height: 60,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    fontSize: 16,
    lineHeight: 24,
  },
  imagePicker: {
    backgroundColor: "#ddd",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
    marginTop: 10,
  },
  imagePickerText: {
    fontSize: 16,
    color: "#555",
  },
  previewImage: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
  },
  disabledButton: {
    backgroundColor: "#ccc",
  },
});
