import React, { useContext, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Button, 
  Platform
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchPictures,
  deletePicture,
  getPresignedUploadUrl,
  uploadFileToOSS,
} from "../../service/OSSService";
import { confirmAction } from "../../utils/confirmAction";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { showAlert } from "../../utils/showAlert";


export default function ManagePicturesPage() {
  const navigation = useNavigation();
  const [pictures, setPictures] = useState([]);
  const { language } = useContext(LanguageContext);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("managePictures"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  useFocusEffect(
    useCallback(() => {
      const loadPictures = async () => {
        try {
          const data = await fetchPictures("event");
          console.log("pictures: ", data);
          setPictures(data);
        } catch (error) {
          console.error("Error fetching pictures:", error);
        }
      };
      loadPictures();
    }, [])
  );

  const handleDeletePicture = async (fileUrl) => {
    console.log("fileurl: ", fileUrl);
    const fileName = fileUrl.split("/").pop().split("?")[0];
    console.log("filename: ", fileName);
    const confirmed = await confirmAction({
      title: i18n.t("delete"),
      message: i18n.t("areYouSure"),
      confirmText: i18n.t("delete"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });

    if (!confirmed) return;

    try {
      await deletePicture(fileName, "event");
      setPictures(pictures.filter((p) => p !== fileUrl));
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("deletePicFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {pictures.length === 0 ? (
        <Text style={styles.noPicturesText}>{i18n.t("noPics")}</Text>
      ) : (
        <View style={styles.gridContainer}>
          {pictures.map((picture, index) => (
            <View key={index} style={styles.imageContainer}>
              <Image
                source={{ uri: picture }}
                style={styles.image}
                resizeMode="contain"
                onError={() => console.error("Error loading image:", picture)}
              />
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeletePicture(picture)}
              >
                <Ionicons name="trash" size={25} color="white" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {pictures.length < 20 ? (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate("AddPicture")}
        >
          <Ionicons name="add" size={30} color="white" />
          <Text style={styles.addButtonText}>{i18n.t("addPic")}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.addButtonDisabled} disabled={true}>
          <Text style={styles.addButtonText}>{i18n.t("picLimit")}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export function AddPicturePage() {
  const navigation = useNavigation();
  const [selectedImage, setSelectedImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const handleUpload = async () => {
    if (!selectedImage) {
      showAlert(i18n.t("error"), i18n.t("noPicSelected"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    setUploading(true);
    try {
      const fileName = `event_${Date.now()}.jpg`; // Change prefix to "announcement_" if needed
      const presignedUrl = await getPresignedUploadUrl(fileName, "event");
      const uploadedUrl = await uploadFileToOSS(selectedImage, presignedUrl);

      showAlert(i18n.t("success"), i18n.t("imageUploadSuccess"), [
        { text: i18n.t("ok") },
      ]);
      navigation.goBack();
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("imageUploadFailed"), [
        { text: i18n.t("ok") },
      ]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.uploadContainer}>
      <Text style={styles.header}>{i18n.t("addPicPageTitle")}</Text>

      {selectedImage && (
        <View style={styles.imagePreviewContainer}>
          <Text style={styles.subHeader}>{i18n.t("imagePreview")}</Text>
          <Image source={{ uri: selectedImage }} style={styles.previewImage} />
        </View>
      )}

      <TouchableOpacity style={styles.pickButton} onPress={pickImage}>
        <Ionicons name="image" size={30} color="white" />
        <Text style={styles.pickButtonText}>
          {selectedImage ? i18n.t("changeImage") : i18n.t("chooseImage")}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.uploadButton, uploading && styles.disabledButton]}
        onPress={handleUpload}
        disabled={uploading}
      >
        <Text style={styles.uploadButtonText}>
          {uploading ? i18n.t("uploading") : i18n.t("uploadImage")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: "#f5f5f5" },
  header: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  subHeader: {
    fontSize: 18,
    marginBottom: 15,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    // Use flex-start for Web grid, space-between for Mobile 2-column look
    justifyContent: Platform.OS === 'web' ? "flex-start" : "space-between",
    paddingVertical: 10,
    // Gap works well on Web; Mobile relies on space-between + width percentage
    gap: Platform.OS === 'web' ? 20 : 0, 
  },
  imageContainer: {
    ...Platform.select({
      web: {
        width: "31%",      // 3 columns on web
        maxWidth: 350,     // Prevents images from getting too big
        minWidth: 200,     // Prevents images from getting too tiny
      },
      default: {           // iOS and Android
        width: "48%",      // 2 columns on mobile
      },
    }),
    aspectRatio: 1,
    marginBottom: 15,
    position: 'relative', // Keeps delete button anchored to this container
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
    backgroundColor: '#ddd',
  },
  deleteButton: {
    position: "absolute",
    top: 8,                // Adjusted to stay inside the image corner
    right: 8,              // Adjusted to stay inside the image corner
    backgroundColor: "rgba(255, 0, 0, 0.8)", // Semi-transparent red
    padding: 6,
    borderRadius: 20,
    zIndex: 10,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007bff",
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  addButtonDisabled: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ccc",
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  addButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 10,
  },
  uploadContainer: {
    flex: 1,
    padding: 20,
  },
  pickButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#28a745",
    padding: 13,
    borderRadius: 10,
    width: "100%",
    marginTop: 20,
    marginBottom: 10,
  },
  pickButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 10,
  },
  imagePreviewContainer: {
    marginTop: 20,
    alignItems: "center",
    alignSelf: "center", // Keeps the preview centered
    width: "100%",
    maxWidth: 600,       // Prevents it from getting too wide on Web
  },
  previewImage: {
    width: "100%",
    aspectRatio: 4 / 3,  // Matches the picker's aspect ratio
    borderRadius: 10,
    backgroundColor: "#ccc",
    resizeMode: "cover", // Or "contain" depending on preference
  },
  uploadButton: {
    backgroundColor: "#007bff",
    padding: 15,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
    marginTop: 50,
  },
  uploadButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  disabledButton: {
    backgroundColor: "#ccc",
  },
  noPicturesText: {
    fontSize: 18,
    color: "gray",
    marginTop: 20,
    textAlign: "center",
  },
});
