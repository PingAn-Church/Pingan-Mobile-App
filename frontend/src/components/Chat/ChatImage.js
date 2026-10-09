import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  getLocalUri as getCachedMedia,
  peekLocalUri as peekCachedMedia,
} from "../../service/MediaCacheService";

// Bounds a chat photo is drawn inside. Wide enough to read, short enough that one
// tall screenshot doesn't push the rest of the conversation off screen.
const IMAGE_BUBBLE_MAX_WIDTH = 240;
const IMAGE_BUBBLE_MAX_HEIGHT = 320;

/**
 * Largest box with the photo's own proportions that fits the bounds above, so
 * nothing is cropped. Replaces the fixed square, which cut the sides off
 * panoramas and the top and bottom off tall shots.
 */
const fitImageWithinBubble = (naturalWidth, naturalHeight) => {
  const ratio = naturalWidth / naturalHeight;
  let width = IMAGE_BUBBLE_MAX_WIDTH;
  let height = width / ratio;

  if (height > IMAGE_BUBBLE_MAX_HEIGHT) {
    height = IMAGE_BUBBLE_MAX_HEIGHT;
    width = height * ratio;
  }

  return { width: Math.round(width), height: Math.round(height) };
};

// A module of its own (NOT declared inside ChatPage) on purpose: a component
// declared inside another component is a brand-new type on every parent render,
// so React unmounts and remounts it each time — which makes every chat <Image>
// reload from the network (the "flashing" in conversation history). At module
// scope the type is stable, so loaded images survive the chat's frequent
// re-renders. React.memo skips re-rendering rows whose props are unchanged.
const ChatImage = React.memo(function ChatImage({
  message,
  isMe,
  resolveUri,
  onPress,
  onLongPress,
}) {
  // Source priority: the local file (sender's own freshly-sent image — instant and
  // survives the optimistic -> persisted swap), then the on-device media cache, then
  // the remote presigned URL. peekCachedMedia seeds the first render synchronously so
  // an already-cached image never flashes through a spinner.
  const [uri, setUri] = useState(
    () => message.localPreviewUri || peekCachedMedia(message.content) || null
  );
  const [displaySize, setDisplaySize] = useState(null);

  useEffect(() => {
    let active = true;
    if (message.localPreviewUri) {
      setUri(message.localPreviewUri);
      return () => {
        active = false;
      };
    }
    // Serve from the local cache (downloads once on a miss); fall back to the remote
    // presigned URL only if it couldn't be cached.
    getCachedMedia(message.content, resolveUri).then(async (local) => {
      if (!active) return;
      setUri(local || (await resolveUri(message.content)));
    });
    return () => {
      active = false;
    };
  }, [message.content, message.localPreviewUri, resolveUri]);

  // Sized from the photo's own proportions rather than a fixed square, so a tall
  // or panoramic shot is shown whole instead of centre-cropped. Until getSize
  // answers, styles.chatImage's square stands in.
  useEffect(() => {
    if (!uri) return undefined;
    let active = true;
    Image.getSize(
      uri,
      (width, height) => {
        if (active && width > 0 && height > 0) setDisplaySize(fitImageWithinBubble(width, height));
      },
      // Unreadable dimensions just keep the fallback box.
      () => {}
    );
    return () => {
      active = false;
    };
  }, [uri]);

  if (!uri) {
    return <ActivityIndicator size="small" color={isMe ? "#FFFFFF" : "#0A84FF"} />;
  }

  return (
    // The long press lives here rather than on the surrounding bubble: this
    // Touchable claims the touch first, so a handler on the parent would never
    // fire for a press that lands on the photo.
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={() => onPress(message, uri)}
      onLongPress={onLongPress ? (event) => onLongPress(message, event) : undefined}
      delayLongPress={300}
    >
      <Image
        source={{ uri }}
        style={[
          styles.chatImage,
          displaySize,
          isMe ? styles.chatImageSent : styles.chatImageReceived,
        ]}
      />
      {message.pending ? (
        <View style={styles.imageUploadOverlay}>
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
});

export default ChatImage;

const styles = StyleSheet.create({
  chatImage: {
    width: 220,
    height: 220,
    borderRadius: 18,
  },
  chatImageSent: {
    borderWidth: 2,
    borderColor: "rgba(10,132,255,0.25)",
  },
  chatImageReceived: {
    borderWidth: 1,
    borderColor: "#D7D7DB",
  },
  // Dim + spinner shown over a photo while it is still uploading.
  imageUploadOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 18,
  },
});
