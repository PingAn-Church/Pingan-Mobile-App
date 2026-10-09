import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View, useWindowDimensions } from "react-native";
import CachedImage from "./CachedImage";
import { naturalSizeFromLoadEvent } from "../utils/imageNaturalSize";

/**
 * A photo drawn whole, at its own proportions.
 *
 * It takes the full width of its container and gets its height from the
 * picture's real aspect ratio, so a portrait shot is tall and a panorama is
 * short — nothing is centre-cropped. A very tall picture is capped at
 * `maxHeight` (60% of the screen by default) and drawn narrower, centred, so
 * one reply can't push everything else off the screen. Until the picture
 * reports its size, `placeholderRatio` stands in.
 *
 * Tapping hands the resolved URL to `onPress`, ready for the ImageViewer.
 *
 * `style` goes on the outer frame: width, margins, radius. Height is decided
 * here and overrides whatever the style says.
 */
export default function FittedImage({
  uri,
  type,
  conversationId = undefined,
  placeholderRatio = 16 / 9,
  maxHeight = undefined,
  style,
  onPress,
  ...rest
}) {
  const { height: screenHeight } = useWindowDimensions();
  const cap = maxHeight || Math.round(screenHeight * 0.6);

  const [frameWidth, setFrameWidth] = useState(0);
  const [natural, setNatural] = useState(null);
  const [resolvedUri, setResolvedUri] = useState(null);

  // A new picture starts from the placeholder again rather than borrowing the
  // last one's shape.
  useEffect(() => {
    setNatural(null);
  }, [uri]);

  const handleLoad = useCallback(
    (event) => {
      const size = naturalSizeFromLoadEvent(event);
      if (size) setNatural(size);
      rest.onLoad?.(event);
    },
    // rest.onLoad is the only piece of `rest` read here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rest.onLoad]
  );

  const ratio = natural ? natural.width / natural.height : placeholderRatio;
  const uncappedHeight = frameWidth > 0 ? frameWidth / ratio : 0;
  const height = Math.min(uncappedHeight, cap);
  const width = height < uncappedHeight ? Math.round(height * ratio) : frameWidth;

  const picture = (
    <CachedImage
      {...rest}
      uri={uri}
      type={type}
      conversationId={conversationId}
      style={[styles.picture, { width, height }]}
      resizeMode="cover"
      onLoad={handleLoad}
      onResolved={setResolvedUri}
    />
  );

  return (
    <View
      style={[styles.frame, style, frameWidth > 0 ? { height } : { aspectRatio: placeholderRatio }]}
      onLayout={(event) => setFrameWidth(Math.round(event.nativeEvent.layout.width))}
    >
      {onPress && resolvedUri ? (
        <TouchableOpacity activeOpacity={0.92} onPress={() => onPress(resolvedUri)}>
          {picture}
        </TouchableOpacity>
      ) : (
        picture
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  picture: {
    backgroundColor: "#eee",
  },
});
