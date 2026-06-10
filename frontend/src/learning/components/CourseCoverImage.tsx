import React, { useEffect, useState } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { resolvePresignedAssetUrl } from "../../service/OSSService";

// Covers uploaded through the course editor live in the private OSS bucket
// under coursePictures/, so the stored URL must be re-signed before display.
// External URLs (e.g. pasted links) render as-is.
const isOssCover = (url: string) => url.includes("/coursePictures/");

// Presigned URLs are valid for 60 minutes; caching per session avoids
// re-signing on every list-item mount.
const signedCache = new Map<string, string>();

const initialUri = (uri?: string | null) => {
  if (!uri) return null;
  return isOssCover(uri) ? signedCache.get(uri) ?? null : uri;
};

export default function CourseCoverImage({
  uri,
  fallback,
  style,
}: {
  uri?: string | null;
  fallback?: string;
  style: StyleProp<ImageStyle>;
}) {
  const [resolved, setResolved] = useState<string | null>(() => initialUri(uri));

  useEffect(() => {
    let active = true;
    const known = initialUri(uri);
    setResolved(known);
    if (uri && isOssCover(uri) && !known) {
      resolvePresignedAssetUrl(uri, "course").then((signed: string | null) => {
        if (signed) signedCache.set(uri, signed);
        if (active && signed) setResolved(signed);
      });
    }
    return () => {
      active = false;
    };
  }, [uri]);

  const displayUri = resolved || fallback;
  return <Image source={displayUri ? { uri: displayUri } : undefined} style={style} />;
}
