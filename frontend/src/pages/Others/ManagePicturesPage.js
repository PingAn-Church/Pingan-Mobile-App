import React, { useContext, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
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
import CachedImage from "../../components/CachedImage";
import { confirmAction } from "../../utils/confirmAction";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { showAlert } from "../../utils/showAlert";


export default function ManagePicturesPage() {
  const navigation = useNavigation();
  const [pictures, setPictures] = useState([]);
  const [marker, setMarker] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const { language } = useContext(LanguageContext);
  const { width } = useWindowDimensions();
  // 3 columns on wide screens (tablets/desktop), 2 otherwise; the list is
  // re-keyed below because FlatList can't change numColumns on the fly.
  const numColumns = width >= 768 ? 3 : 2;

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("managePictures"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  useFocusEffect(
    useCallback(() => {
      loadPictures(true);
    }, [])
  );

  const loadPictures = async (replace = false) => {
    if (!replace && (loading || !hasMore)) return;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetchPictures("event", {
        size: 20,
        marker: replace ? null : marker,
      });
      const data = Array.isArray(response?.data) ? response.data : [];
      setPictures((prev) =>
        replace ? data : [...prev, ...data.filter((picture) => !prev.includes(picture))]
      );
      setMarker(response?.pagination?.nextMarker || null);
      setHasMore(Boolean(response?.pagination?.hasMore));
    } catch (error) {
      console.error("Error fetching pictures:", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

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
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.container}
        data={pictures}
        key={numColumns}
        keyExtractor={(item) => item}
        numColumns={numColumns}
        onEndReached={() => loadPictures(false)}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loading ? (
            <ActivityIndicator style={{ marginVertical: 16 }} />
          ) : loadError && pictures.length > 0 ? (
            <View style={styles.errorState}>
              <Text style={styles.noPicturesText}>{i18n.t("loadPicturesFailed")}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => loadPictures(false)}>
                <Text style={styles.retryText}>{i18n.t("tryAgain")}</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            loadError ? (
              <View style={styles.errorState}>
                <Text style={styles.noPicturesText}>{i18n.t("loadPicturesFailed")}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={() => loadPictures(true)}>
                  <Text style={styles.retryText}>{i18n.t("tryAgain")}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.noPicturesText}>{i18n.t("noPics")}</Text>
            )
          ) : null
        }
        renderItem={({ item: picture }) => (
            <View
              style={[
                styles.imageContainer,
                numColumns === 3 ? styles.imageContainerThreeCol : styles.imageContainerTwoCol,
              ]}
            >
              {/* Stripped of its signature before caching: the listing signs every
                  URL afresh, so the raw one is a different cache key each load. */}
              <CachedImage
                uri={String(picture).split("?")[0]}
                type="event"
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
        )}
      />

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
    </View>
  );
}

export function AddPicturePage() {
  const navigation = useNavigation();
  const [selectedImage, setSelectedImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const handleUpload = async () => {
    if (uploading) return; // ignore repeat taps while uploading
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
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  container: { flexGrow: 1, padding: 20, backgroundColor: "#f5f5f5" },
  header: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  subHeader: {
    fontSize: 18,
    marginBottom: 15,
  },
  // Width follows the live column count (see numColumns), not the platform,
  // so rotation/resize can move between 2 and 3 columns without overflow.
  imageContainer: {
    aspectRatio: 1,
    marginBottom: 15,
    marginHorizontal: "1%",
    position: 'relative', // Keeps delete button anchored to this container
  },
  imageContainerTwoCol: {
    width: "48%",
  },
  imageContainerThreeCol: {
    width: "31%",
    maxWidth: 350, // Prevents images from getting too big
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
  errorState: {
    alignItems: "center",
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: "#007AFF",
    borderRadius: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 10,
  },
  retryText: {
    color: "white",
    fontWeight: "600",
  },
});
