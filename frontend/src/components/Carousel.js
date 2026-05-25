import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  Text,
  Image,
  StyleSheet,
  Animated,
  Platform,
  Pressable,
} from "react-native";
import { Linking } from "react-native";

const CARD_HEIGHT = 400;
const AUTO_SCROLL_INTERVAL = 4000; // Slower, more relaxed pace compared to 3000

const Carousel = ({ data, interval = AUTO_SCROLL_INTERVAL }) => {
  // Use state for width to ensure re-render on layout calculation
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef(null);
  const currentIndex = useRef(0);
  const timerRef = useRef(null);

  // Helper to handle auto-scroll logic
  const startAutoScroll = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      if (!data?.length || layout.width === 0) return;

      const nextIndex =
        currentIndex.current + 1 >= data.length ? 0 : currentIndex.current + 1;

      currentIndex.current = nextIndex;

      scrollViewRef.current?.scrollTo({
        x: nextIndex * layout.width,
        animated: true,
      });
    }, interval);
  }, [data, interval, layout.width]);

  const stopAutoScroll = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  useEffect(() => {
    startAutoScroll();
    return () => stopAutoScroll();
  }, [startAutoScroll]);

  // Handle manual scroll (update current index)
  const handleScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    // Calculate index based on scroll position
    const index = Math.round(offsetX / layout.width);
    currentIndex.current = index;
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
                    {/* Shadow Wrapper */}
                    <View style={styles.shadowLayer}>
                      <Image
                        source={{ uri: item.imageUrl }}
                        style={styles.cardImage}
                        resizeMode="cover"
                      />
                    </View>

                    {/* Text Content */}
                    <View style={styles.textContainer}>
                      <Text style={styles.kickerText}>
                        {item.subtitle?.toUpperCase() || "FEATURED"}
                      </Text>
                      <Text style={styles.titleText} numberOfLines={2}>
                        {item.description}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          {/* Pagination */}
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
  container: {
    height: CARD_HEIGHT,
    width: "100%",
    backgroundColor: "#fff", // Clean canvas
  },
  slide: {
    height: CARD_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20
  },
  cardContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "flex-start", // Top align items
    paddingTop: 10,
  },
  shadowLayer: {
    width: "100%",
    height: 280,
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
    position: "absolute",
    bottom: 20,
    flexDirection: "row",
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
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
