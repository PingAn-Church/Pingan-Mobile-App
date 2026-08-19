import { showAlert } from "../../utils/showAlert";
import React, { useState, useContext, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import PlatformWebView from "../../components/PlatformWebView";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { addVideo, fetchVideos, deleteVideo } from "../../service/VideoService";
import { confirmAction } from "../../utils/confirmAction";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";

const getEmbedUrl = (videoId, type) => {
  return type === "YouTube"
    ? `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`
    : `https://v.qq.com/txp/iframe/player.html?vid=${videoId}`;
};

export default function ManageVideosPage() {
  const [videos, setVideos] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();
  const { language } = useContext(LanguageContext);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("manageVideos"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  const loadVideos = async (nextPage = 0, replace = false) => {
    if (!replace && (loading || !hasMore)) return;
    setLoading(true);
    try {
      const response = await fetchVideos({ page: nextPage, size: 10 });
      const fetchedVideos = Array.isArray(response?.data) ? response.data : [];
      setVideos((prev) =>
        replace
          ? fetchedVideos
          : [...prev, ...fetchedVideos.filter((video) => !prev.some((p) => p.id === video.id))]
      );
      setPage(Number.isFinite(Number(response?.pagination?.page)) ? Number(response.pagination.page) : nextPage);
      setHasMore(Boolean(response?.pagination?.hasMore));
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("loadVideoFailed"), [
        { text: i18n.t("ok") },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setVideos([]);
      setPage(0);
      setHasMore(true);
      loadVideos(0, true);
    }, [])
  );

  const handleDeleteVideo = async (id) => {
    const confirmed = await confirmAction({
      title: i18n.t("delete"),
      message: i18n.t("areYouSure"),
      confirmText: i18n.t("delete"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });

    if (!confirmed) return;

    try {
      await deleteVideo(id);
      loadVideos(0, true);
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("deleteVideoFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.scrollContainer}
        data={videos}
        keyExtractor={(item) => String(item.id)}
        onEndReached={() => loadVideos(page + 1, false)}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loading ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
        renderItem={({ item: video }) => (
          <View style={styles.videoWrapper}>
            <View style={styles.videoContainer}>
              <PlatformWebView
                source={{ uri: getEmbedUrl(video.videoId, video.videoType) }}
                style={styles.video}
                javaScriptEnabled
                domStorageEnabled
              />
              <TouchableOpacity
                onPress={() => handleDeleteVideo(video.id)}
                style={styles.deleteButton}
              >
                <Ionicons name="trash-outline" size={24} color="white" />
              </TouchableOpacity>
            </View>
            <Text style={styles.videoTitle}>{video.title}</Text>
          </View>
        )}
      />

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate("AddVideo")}
      >
        <Ionicons name="add-circle" size={40} color="white" />
      </TouchableOpacity>
    </View>
  );
}

export function AddVideoPage() {
  const navigation = useNavigation();
  const [videoUrl, setVideoUrl] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const extractVideoId = (url) => {
    const youtubeRegex =
      /(?:youtube\.com\/.*[?&]v=|youtu\.be\/)([a-zA-Z0-9_-]+)/;
    const tencentRegex = /\/x\/(?:page|cover\/\w+)\/([a-zA-Z0-9]+)\.html/;

    const youtubeMatch = url.match(youtubeRegex);
    const tencentMatch = url.match(tencentRegex);

    if (youtubeMatch) {
      return { id: youtubeMatch[1], type: "YouTube" };
    } else if (tencentMatch) {
      return { id: tencentMatch[1], type: "Tencent" };
    } else {
      return null;
    }
  };

  const handleAddVideo = async () => {
    if (submitting) return; // ignore repeat taps while adding
    if (!videoUrl || !title) {
      showAlert(i18n.t("error"), i18n.t("enterTitleAndURL"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    if (title.length > 35) {
      showAlert(i18n.t("error"), i18n.t("videoTitleLessThan50"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    const videoData = extractVideoId(videoUrl);
    if (!videoData) {
      showAlert(i18n.t("error"), i18n.t("invalidURL"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    setSubmitting(true);
    try {
      await addVideo(title, videoData.id, videoData.type);
      setVideoUrl("");
      setTitle("");
      showAlert(i18n.t("success"), i18n.t("addVideoSuccess"), [
        { text: i18n.t("ok"), onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("addVideoFailed"), [
        { text: i18n.t("ok") },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{i18n.t("addVideoPageTitle")}</Text>

      <TextInput
        style={styles.input}
        placeholder={i18n.t("videoTitle")}
        value={title}
        onChangeText={setTitle}
      />
      <Text style={{ marginBottom: 15, fontSize: 16 }}>{title.length}/35</Text>

      <TextInput
        style={styles.inputCopy}
        placeholder={i18n.t("pasteURL")}
        value={videoUrl}
        multiline={true}
        numberOfLines={2}
        textAlignVertical="top"
        onChangeText={setVideoUrl}
      />

      <TouchableOpacity
        style={[styles.addButton2, submitting && { opacity: 0.6 }]}
        onPress={handleAddVideo}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.addButtonText}>{i18n.t("addVideo")}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  scrollContainer: {
    flexGrow: 1,
  },
  videoWrapper: {
    marginBottom: 15,
    alignItems: "center",
  },
  header: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
  },
  videoContainer: {
    marginBottom: 5,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
    width: "100%",
    aspectRatio: 16 / 9,
  },
  video: {
    flex: 1,
  },
  deleteButton: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "red",
    padding: 10,
    borderRadius: 20,
  },
  addButton: {
    position: "absolute",
    bottom: 30,
    right: 30,
    backgroundColor: "#007bff",
    padding: 10,
    borderRadius: 50,
  },
  input: {
    // minHeight, not height: a fixed box clips the text at large system fonts.
    minHeight: 40,
    borderColor: "gray",
    borderWidth: 1,
    marginBottom: 5,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    fontSize: 16,
  },
  inputCopy: {
    height: 60,
    borderColor: "gray",
    borderWidth: 1,
    marginBottom: 20,
    padding: 10,
    backgroundColor: "#fff",
    fontSize: 16,
  },
  videoTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
    textAlign: "center",
  },
  addButton2: {
    backgroundColor: "#007BFF",
    padding: 10,
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
});
