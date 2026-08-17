import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { Linking } from "react-native";
import CachedImage from "./CachedImage";

const AUTO_SCROLL_INTERVAL = 4000; // Slower, more relaxed pace compared to 3000

// Horizontal breathing room on each side of a card, inside the slide.
const SLIDE_PADDING = 20;

// Announcement posters are uploaded in whatever shape they were designed in —
// wide banners, square graphics, tall portrait flyers — so the card takes its
// height from the picture instead of forcing every picture into one box. The
// bounds below only catch the extremes: anything outside them is fitted (never
// cropped) onto the card background rather than being allowed to push the
// title off the bottom of the screen.
const MIN_ASPECT_RATIO = 0.7; // taller than ~7:10 portrait
const MAX_ASPECT_RATIO = 2.5; // wider than ~5:2 panorama
// Used until the real dimensions come back, and for images that fail to load.
const FALLBACK_ASPECT_RATIO = 16 / 9;
// However tall the picture is, leave room for the title and the rest of the page.
const MAX_IMAGE_SCREEN_FRACTION = 0.55;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// The real pixel size of a picture that has just finished loading. React Native
// reports it as `source` on iOS/Android and as the underlying DOM <img> on web.
// Reading it off the load event means the measurement rides along with bytes the
// card was fetching anyway, instead of costing a second request the way
// Image.getSize did.
const naturalSizeOf = (event) => {
  const source = event?.nativeEvent?.source;
  if (source?.width > 0 && source?.height > 0) return source;
  const target = event?.nativeEvent?.target;
  if (target?.naturalWidth > 0 && target?.naturalHeight > 0) {
    return { width: target.naturalWidth, height: target.naturalHeight };
  }
  return null;
};

const Carousel = ({ data, interval = AUTO_SCROLL_INTERVAL }) => {
  // Use state for width to ensure re-render on layout calculation
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  // Real aspect ratio (width / height) of each picture, keyed by its stored
  // object path — the same identity CachedImage caches under, and stable across
  // visits, unlike the short-lived signed URL the path resolves to.
  const [aspectRatios, setAspectRatios] = useState({});
  const { height: windowHeight } = useWindowDimensions();

  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef(null);
  const currentIndex = useRef(0);
  const timerRef = useRef(null);

  const slideCount = data?.length ?? 0;

  // Helper to handle auto-scroll logic
  const startAutoScroll = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      if (!slideCount || layout.width === 0) return;

      const nextIndex =
        currentIndex.current + 1 >= slideCount ? 0 : currentIndex.current + 1;

      currentIndex.current = nextIndex;

      scrollViewRef.current?.scrollTo({
        x: nextIndex * layout.width,
        animated: true,
      });
      // Depending on the slide count rather than the array itself keeps the timer
      // alive: `data` is a fresh array on every render of the parent, and a new
      // interval was being started (and the old one cleared mid-flight) each time.
    }, interval);
  }, [slideCount, interval, layout.width]);

  const stopAutoScroll = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  useEffect(() => {
    startAutoScroll();
    return () => stopAutoScroll();
  }, [startAutoScroll]);

  // Record each picture's real shape the first time it draws. Until then the card
  // uses FALLBACK_ASPECT_RATIO, so slides never render at zero height; a picture
  // that never loads simply stays on that shape.
  const handleImageLoaded = useCallback((key, event) => {
    const size = naturalSizeOf(event);
    if (!key || !size) return;
    setAspectRatios((previous) =>
      previous[key] ? previous : { ...previous, [key]: size.width / size.height }
    );
  }, []);

  // Handle manual scroll (update current index)
  const handleScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    // Calculate index based on scroll position
    const index = Math.round(offsetX / layout.width);
    currentIndex.current = index;
  };

  const cardWidth = Math.max(layout.width - SLIDE_PADDING * 2, 0);

  const imageHeightFor = (item) => {
    const ratio = clamp(
      aspectRatios[item?.imageUrl] || FALLBACK_ASPECT_RATIO,
      MIN_ASPECT_RATIO,
      MAX_ASPECT_RATIO
    );
    return Math.min(cardWidth / ratio, windowHeight * MAX_IMAGE_SCREEN_FRACTION);
  };

  if (!data || data.length === 0) return null;

  return (
    <View
      style={styles.container}
      onLayout={(e) => setLayout(e.nativeEvent.layout)}
    >
      {layout.width > 0 && (
        <>
          <ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            decelerationRate="fast"
            snapToInterval={layout.width}
            onScrollBeginDrag={stopAutoScroll} // Pause on user interaction
            onScrollEndDrag={startAutoScroll}  // Resume after interaction
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              {
                useNativeDriver: false,
                listener: handleScroll
              }
            )}
          >
            {data.map((item, index) => {
              return (
                <View
                  key={item.key || index}
                  style={[styles.slide, { width: layout.width }]}
                >
                  <Pressable
                    disabled={!item.link}
                    onPress={() => {
                      if (item.link) {
                        Linking.openURL(item.link);
                      }
                    }}
                    android_ripple={{ color: "#e5e5e5" }}
                    style={({ pressed }) => [
                      styles.cardContainer,
                      pressed && { opacity: 0.96 },
                    ]}
                  >
                    {/* Shadow Wrapper — sized to this picture's own proportions */}
                    <View style={[styles.shadowLayer, { height: imageHeightFor(item) }]}>
                      <CachedImage
                        uri={item.imageUrl}
                        type="announcement"
                        style={styles.cardImage}
                        // The frame already matches the picture, so nothing is
                        // letterboxed in the normal case; "contain" only matters
                        // for the clamped extremes, where fitting beats cropping
                        // a poster whose text runs to the edge.
                        resizeMode="contain"
                        onLoad={(event) => handleImageLoaded(item.imageUrl, event)}
                      />
                    </View>

                    {/* Text Content */}
                    <View style={styles.textContainer}>
                      <Text style={styles.kickerText}>
                        {item.subtitle?.toUpperCase() || "FEATURED"}
                      </Text>
                      {/* Deliberately unclamped: announcement titles are written
                          as sentences and are often longer in Chinese, so they
                          wrap onto as many lines as they need. */}
                      <Text style={styles.titleText}>
                        {item.description}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          {/* Pagination. Sits below the cards in normal flow rather than floating
              over them — with a variable card height there is no longer a fixed
              bottom strip guaranteed to be empty. */}
          <View style={styles.paginationContainer}>
            {data.map((_, index) => {
              const inputRange = [
                (index - 1) * layout.width,
                index * layout.width,
                (index + 1) * layout.width,
              ];

              const opacity = scrollX.interpolate({
                inputRange,
                outputRange: [0.3, 1, 0.3],
                extrapolate: "clamp",
              });

              const scale = scrollX.interpolate({
                inputRange,
                outputRange: [0.8, 1, 0.8],
                extrapolate: "clamp",
              });

              return (
                <Animated.View
                  key={index}
                  style={[
                    styles.dot,
                    { opacity, transform: [{ scale }] },
                  ]}
                />
              );
            })}
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  // No fixed height anywhere below: the row of slides is as tall as its tallest
  // card, and the carousel is as tall as that row.
  container: {
    width: "100%",
    backgroundColor: "#fff", // Clean canvas
  },
  slide: {
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: SLIDE_PADDING,
  },
  cardContainer: {
    width: "100%",
    justifyContent: "flex-start", // Top align items
    paddingTop: 10,
  },
  shadowLayer: {
    width: "100%",
    borderRadius: 18,
    backgroundColor: "#f0f0f0", // Placeholder color
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 24,
  },
  cardImage: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
  },
  textContainer: {
    paddingHorizontal: 4,
    alignItems: 'flex-start', // Left align for Apple feel
  },
  kickerText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#86868b",
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  titleText: {
    fontSize: 26,
    fontWeight: "600",
    color: "#1d1d1f",
    lineHeight: 32,
    letterSpacing: -0.5, // Tighter tracking for headlines
  },
  paginationContainer: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#1d1d1f",
    marginHorizontal: 5,
  },
});

export default Carousel;
