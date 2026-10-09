/**
 * The picture's own pixel size, read off an <Image onLoad> event.
 *
 * iOS and Android report it as `nativeEvent.source`; react-native-web hands
 * back the raw DOM load event, where the size sits on the <img> element as
 * naturalWidth/naturalHeight. Returns null when neither is there, so callers
 * keep whatever placeholder shape they were drawing.
 */
export const naturalSizeFromLoadEvent = (event) => {
  const native = event?.nativeEvent;
  const width = native?.source?.width ?? native?.target?.naturalWidth;
  const height = native?.source?.height ?? native?.target?.naturalHeight;
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height };
};
