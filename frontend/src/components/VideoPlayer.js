import React, { useState } from "react";
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import PlatformWebView from "./PlatformWebView";
import { Ionicons } from "@expo/vector-icons";

export default function VideoPlayer({ videoId }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const { width, height } = useWindowDimensions();
  // 3/4 of the window width at 16:9, capped so the player never exceeds ~55%
  // of the window height (landscape tablets). Recomputed on rotation, unlike
  // the old module-scope Dimensions.get snapshot.
  const videoWidth = Math.min(width * 0.75, height * 0.55 * (16 / 9));
  const videoHeight = videoWidth * (9 / 16);

  const youtubeThumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`; // Thumbnail URL

  return (
    <View style={[styles.container, { width: videoWidth, height: videoHeight }]}>
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
