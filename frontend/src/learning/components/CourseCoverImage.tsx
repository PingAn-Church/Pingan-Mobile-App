import React from "react";
import { type ImageStyle, type StyleProp } from "react-native";
import CachedImage from "../../components/CachedImage";

// Course covers live in the private OSS bucket under coursePictures/, so they're
// served from the on-device cache via <CachedImage> (presigned on a miss). External
// URLs (pasted links) render as-is. Changing a cover uploads a new object key, so the
// cache self-invalidates — no observe/notify needed.
export default function CourseCoverImage({
  uri,
  fallback,
  style,
}: {
  uri?: string | null;
  fallback?: string;
  style: StyleProp<ImageStyle>;
}) {
  return (
    <CachedImage
      uri={uri ?? null}
      type="course"
      fallbackSource={fallback ? { uri: fallback } : undefined}
      style={style}
    />
  );
}
