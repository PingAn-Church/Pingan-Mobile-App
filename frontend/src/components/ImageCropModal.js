import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Reanimated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import * as ImageManipulator from "expo-image-manipulator";
import i18n from "../../i18n";

const MAX_ZOOM = 6;
// Announcement covers are plenty at this width; matches compressImage's ceiling class.
const MAX_OUTPUT_WIDTH = 1600;

/**
 * Full-screen crop editor for an EXISTING local image: the crop window is fixed
 * (the announcement carousel's 6:3 by default, same as the picker's crop at
 * create time) and the picture pans/zooms underneath it, Instagram-style.
 *
 * Exists because expo-image-picker's native crop UI only runs while picking a
 * new photo — there is no system UI for re-cropping a file you already have.
 * What's visible inside the window is exactly what ImageManipulator crops.
 *
 * @param visible    render the modal
 * @param imageUri   LOCAL file uri (download remote images first)
 * @param aspect     [w, h] of the crop window, default [6, 3]
 * @param onCancel   dismissed without cropping
 * @param onCropped  async-safe callback with the cropped JPEG's local uri
 */
export default function ImageCropModal({
  visible,
  imageUri,
  aspect = [6, 3],
  onCancel,
  onCropped,
}) {
  const { width: windowWidth } = useWindowDimensions();
  const frameWidth = Math.min(windowWidth - 32, 640);
  const frameHeight = (frameWidth * aspect[1]) / aspect[0];

  const [naturalSize, setNaturalSize] = useState(null);
  const [working, setWorking] = useState(false);

  // Zoom is relative to the cover scale (1 = picture exactly covers the window),
  // translation is in window pixels off-centre. Clamped so the window is always
  // fully covered — the crop rect can then never leave the picture.
  const zoom = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startZoom = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  useEffect(() => {
    setNaturalSize(null);
    if (!visible || !imageUri) return;
    zoom.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    Image.getSize(
      imageUri,
      (w, h) => setNaturalSize({ width: w, height: h }),
      () => setNaturalSize(null)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, imageUri]);

  // Scale that makes the picture exactly cover the crop window at zoom 1.
  const coverScale = naturalSize
    ? Math.max(frameWidth / naturalSize.width, frameHeight / naturalSize.height)
    : 1;
  const baseWidth = naturalSize ? naturalSize.width * coverScale : frameWidth;
  const baseHeight = naturalSize ? naturalSize.height * coverScale : frameHeight;

  const gesture = useMemo(() => {
    const clampAll = (z, tx, ty) => {
      "worklet";
      const maxX = Math.max(0, (baseWidth * z - frameWidth) / 2);
      const maxY = Math.max(0, (baseHeight * z - frameHeight) / 2);
      return {
        z,
        tx: Math.min(maxX, Math.max(-maxX, tx)),
        ty: Math.min(maxY, Math.max(-maxY, ty)),
      };
    };

    const pan = Gesture.Pan()
      .onStart(() => {
        startX.value = translateX.value;
        startY.value = translateY.value;
      })
      .onUpdate((event) => {
        const next = clampAll(
          zoom.value,
          startX.value + event.translationX,
          startY.value + event.translationY
        );
        translateX.value = next.tx;
        translateY.value = next.ty;
      });

    const pinch = Gesture.Pinch()
      .onStart(() => {
        startZoom.value = zoom.value;
      })
      .onUpdate((event) => {
        const z = Math.min(MAX_ZOOM, Math.max(1, startZoom.value * event.scale));
        const next = clampAll(z, translateX.value, translateY.value);
        zoom.value = next.z;
        translateX.value = next.tx;
        translateY.value = next.ty;
      });

    return Gesture.Simultaneous(pan, pinch);
  }, [baseWidth, baseHeight, frameWidth, frameHeight]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: zoom.value },
    ],
  }));

  const handleConfirm = async () => {
    if (!naturalSize || working) return;
    setWorking(true);
    try {
      // Window -> image-pixel mapping: total on-screen scale is cover * zoom, and
      // the picture's centre sits at the window centre plus the translation.
      const totalScale = coverScale * zoom.value;
      const cropWidth = frameWidth / totalScale;
      const cropHeight = frameHeight / totalScale;
      let originX = ((baseWidth * zoom.value - frameWidth) / 2 - translateX.value) / totalScale;
      let originY = ((baseHeight * zoom.value - frameHeight) / 2 - translateY.value) / totalScale;
      // Guard rounding drift at the extremes.
      originX = Math.min(Math.max(0, originX), naturalSize.width - cropWidth);
      originY = Math.min(Math.max(0, originY), naturalSize.height - cropHeight);

      const actions = [
        {
          crop: {
            originX: Math.round(originX),
            originY: Math.round(originY),
            width: Math.max(1, Math.round(cropWidth)),
            height: Math.max(1, Math.round(cropHeight)),
          },
        },
      ];
      if (cropWidth > MAX_OUTPUT_WIDTH) {
        actions.push({ resize: { width: MAX_OUTPUT_WIDTH } });
      }

      const result = await ImageManipulator.manipulateAsync(imageUri, actions, {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      await onCropped(result.uri);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      {/* RN Modal opens a new native window on Android; gesture-handler needs
          its own root inside it or the pan/pinch never fire. */}
      <GestureHandlerRootView style={styles.container}>
        <Text style={styles.title}>{i18n.t("recropImage")}</Text>
        <Text style={styles.hint}>{i18n.t("cropHint")}</Text>

        <View style={styles.frameWrap}>
          <GestureDetector gesture={gesture}>
            <View
              style={[styles.frame, { width: frameWidth, height: frameHeight }]}
            >
              {naturalSize ? (
                <Reanimated.View
                  style={[{ width: baseWidth, height: baseHeight }, imageStyle]}
                >
                  <Image
                    source={{ uri: imageUri }}
                    style={{ width: baseWidth, height: baseHeight }}
                    resizeMode="cover"
                  />
                </Reanimated.View>
              ) : (
                <ActivityIndicator color="#fff" />
              )}
            </View>
          </GestureDetector>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onCancel}
            disabled={working}
          >
            <Text style={styles.secondaryButtonText}>{i18n.t("cancel")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, (working || !naturalSize) && styles.buttonDisabled]}
            onPress={handleConfirm}
            disabled={working || !naturalSize}
          >
            {working ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>{i18n.t("save")}</Text>
            )}
          </TouchableOpacity>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 6,
  },
  hint: {
    color: "#bbb",
    fontSize: 14,
    marginBottom: 18,
    textAlign: "center",
  },
  frameWrap: {
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 4,
  },
  frame: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  primaryButton: {
    minWidth: 130,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: "#007AFF",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    minWidth: 110,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: "#333",
  },
  secondaryButtonText: {
    color: "#eee",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
