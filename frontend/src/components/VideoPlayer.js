import React, { useState } from "react";
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import PlatformWebView from "./PlatformWebView";
import { Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");
const videoWidth = width * 0.75; // Set a consistent width for the video player
const videoHeight = videoWidth * 0.56; // Maintain 16:9 aspect ratio

export default function VideoPlayer({ videoId }) {
  const [isPlaying, setIsPlaying] = useState(false);

  const youtubeThumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`; // Thumbnail URL

  return (
    <View style={styles.container}>
      {isPlaying ? (
        <PlatformWebView
          source={{
            uri: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
          }}
          style={{ width: videoWidth, height: videoHeight }}
          javaScriptEnabled
          domStorageEnabled
        />
      ) : (
        <TouchableOpacity
          onPress={() => setIsPlaying(true)}
          style={styles.thumbnailContainer}
        >
          <Image source={{ uri: youtubeThumbnail }} style={styles.thumbnail} />
          <Ionicons
            name="play-circle"
            size={64}
            color="white"
            style={styles.playIcon}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: videoWidth,
    height: videoHeight,
    borderRadius: 10,
    overflow: "hidden",
    alignSelf: "center",
  },
  thumbnailContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    backgroundColor: "black",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
    position: "absolute",
  },
  playIcon: {
    position: "absolute",
    zIndex: 1,
  },
});
