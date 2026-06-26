import React, { useEffect, useState } from "react";
import { Image } from "react-native";
import { resolvePresignedAssetUrl } from "../service/OSSService";
import {
  getLocalUri as getCachedMedia,
  peekLocalUri as peekCachedMedia,
} from "../service/MediaCacheService";

// OSS folders this app owns. These live in a private bucket (need a presigned URL to
// view) and are safe to cache by object path: every change uploads under a NEW key,
// so the path — our cache key — changes and the cache self-invalidates (no notify
// model needed). URLs outside these folders (e.g. pasted external links) render as-is.
const MANAGED_PREFIXES = [
  "userProfilePictures/",
  "groupProfilePictures/",
  "coursePictures/",
  "conversations/",
  "documents/",
  "eventPictures/",
  "announcementPictures/",
  "otherPictures/",
];

const isManaged = (url) =>
  typeof url === "string" && MANAGED_PREFIXES.some((p) => url.includes(p));

/**
 * Drop-in <Image> for managed OSS assets (avatars, group icons, course covers, ...).
 * Serves the file from the on-device MediaCacheService, downloading once via a
 * presigned URL on a miss, then rendering the local file thereafter — so the same
 * image isn't re-downloaded on every render (and it shows in the storage counter /
 * Clear cache). Falls back to the remote presigned URL if it can't be cached, and to
 * `fallbackSource` while resolving or when there's no uri.
 *
 * @param uri            stored object URL/path (the cache identity)
 * @param type           OSS file type for presigning ("profile" | "group" | "course" | ...)
 * @param fallbackSource RN Image source shown when there's no resolved uri (e.g. a default avatar)
 */
export default function CachedImage({ uri, type, fallbackSource = null, style, ...rest }) {
  const managed = isManaged(uri);
  const [resolved, setResolved] = useState(() =>
    uri ? (managed ? peekCachedMedia(uri) : uri) : null
  );

  useEffect(() => {
    let active = true;

    if (!uri) {
      setResolved(null);
      return;
    }
    if (!managed) {
      setResolved(uri); // external URL — render directly
      return;
    }

    const cached = peekCachedMedia(uri);
    if (cached) {
      setResolved(cached);
      return () => {
        active = false;
      };
    }

    // Cache miss: download once (keyed by object path), fall back to the remote
    // presigned URL only if it couldn't be cached.
    getCachedMedia(uri, (u) => resolvePresignedAssetUrl(u, type)).then(async (local) => {
      if (!active) return;
      setResolved(local || (await resolvePresignedAssetUrl(uri, type)));
    });

    return () => {
      active = false;
    };
  }, [uri, type, managed]);

  const source = resolved ? { uri: resolved } : fallbackSource;
  return <Image source={source} style={style} {...rest} />;
}
