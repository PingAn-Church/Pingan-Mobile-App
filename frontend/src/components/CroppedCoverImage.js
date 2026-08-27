import React, { useCallback, useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import CachedImage from "./CachedImage";
import { naturalSizeFromLoadEvent } from "../utils/imageNaturalSize";

/**
 * A cover cropped to a fixed frame — for list rows, where every card being the
 * same shape matters more than showing the whole picture — with a soft fade
 * along the edges where the picture continues past the frame. A portrait shot
 * fades at the top and bottom, a panorama at the left and right, and a photo
 * that already fits gets no fade at all: the hint appears exactly where there
 * is more to see.
 *
 * The fades are two tiny PNG gradients stretched to size. A gradient library
 * would mean a new native module and a dev-client rebuild for one effect.
 * They fade to white, which is the card colour everywhere this is used.
 */
export default function CroppedCoverImage({ uri, type, frameRatio = 16 / 9, style, ...rest }) {
  const [natural, setNatural] = useState(null);

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

  const crop = croppedEdges(natural, frameRatio);

  return (
    <View style={[styles.frame, { aspectRatio: frameRatio }, style]}>
      <CachedImage
        {...rest}
        uri={uri}
        type={type}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onLoad={handleLoad}
      />
      {crop === "vertical" && (
        <>
          <Image source={FADE_DOWN} style={[styles.fade, styles.fadeTop]} resizeMode="stretch" pointerEvents="none" />
          <Image source={FADE_DOWN} style={[styles.fade, styles.fadeBottom]} resizeMode="stretch" pointerEvents="none" />
        </>
      )}
      {crop === "horizontal" && (
        <>
          <Image source={FADE_RIGHT} style={[styles.fade, styles.fadeLeft]} resizeMode="stretch" pointerEvents="none" />
          <Image source={FADE_RIGHT} style={[styles.fade, styles.fadeRight]} resizeMode="stretch" pointerEvents="none" />
        </>
      )}
    </View>
  );
}

/**
 * Which edges the frame cuts off, or null when the picture fits. A few percent
 * of slack keeps a photo that is very nearly the frame's shape from fading for
 * a sliver nobody would miss.
 */
const croppedEdges = (natural, frameRatio) => {
  if (!natural) return null;
  const ratio = natural.width / natural.height;
  if (ratio < frameRatio * 0.96) return "vertical";
  if (ratio > frameRatio * 1.04) return "horizontal";
  return null;
};

// 1×32 white, opaque at the top easing to clear; 32×1 the same left to right.
const FADE_DOWN = {
  uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAgCAYAAADT5RIaAAAAW0lEQVR42hXEoQ2DQABA0SMkCAQChUHhcHU4JLa2FovG4tF4fAeo7wBdoAOwAAvAvZ/8F65YiJ848McPX3zwxo4NKxbMmDDihScG9OjwQIsGNSqUKJAjQ4oE4Qagd2wC22JuPwAAAABJRU5ErkJggg==",
};
const FADE_RIGHT = {
  uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAABCAYAAAC/iqxnAAAAUklEQVR42iXDIRJEAAAAQMaMIAiSImmapomqql69rOqyfv0eoHuAD3iAD/gAO2NnNrhfl6eHu5urf38uzk6Ofv042NvZ2lhbWVqYm5maGBsZGjy8OmwCviufrwAAAABJRU5ErkJggg==",
};

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#eee",
  },
  fade: {
    position: "absolute",
  },
  fadeTop: { top: 0, left: 0, right: 0, height: "26%" },
  fadeBottom: { bottom: 0, left: 0, right: 0, height: "26%", transform: [{ scaleY: -1 }] },
  fadeLeft: { top: 0, bottom: 0, left: 0, width: "18%" },
  fadeRight: { top: 0, bottom: 0, right: 0, width: "18%", transform: [{ scaleX: -1 }] },
});
