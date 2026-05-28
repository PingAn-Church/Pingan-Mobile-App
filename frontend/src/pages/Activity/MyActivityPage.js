import React, { act, useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Platform,
  Alert,
  Dimensions
} from "react-native";
import { getAllEvents } from "../../service/EventService";
import { UserContext } from "../../context/UserContext";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";
import { fetchPictures } from "../../service/OSSService";
import i18n from "../../../i18n";
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library'; 
import { Ionicons } from "@expo/vector-icons";      
import { showAlert } from "../../utils/showAlert";

export default function MyActivityPage() {
  const [activeTab, setActiveTab] = useState("Upcoming");
  const [events, setEvents] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [pastEvents, setPastEvents] = useState([]);
  const { user } = useContext(UserContext);
  const navigation = useNavigation();
  const [eventPictures, setEventPictures] = useState([]);

  const convertToDateTime = (dateString, timeString) => {
    if (!dateString || !timeString) return NaN;

    // Ensure timeString is in the format "HH:MM AM/PM"
    timeString = timeString.replace(/\u202F/g, " ").trim(); // Fix non-breaking spaces

    // Parse time correctly
    const timeRegex = /^(\d{1,2}):(\d{2})\s?(AM|PM)$/;
    const match = timeString.match(timeRegex);

    if (!match) {
      console.warn("Invalid time format:", timeString);
      return NaN;
    }

    let [, hours, minutes, modifier] = match;
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10);

    if (modifier === "PM" && hours !== 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;

    // Create a new Date object with the correct time
    const eventDateTime = new Date(dateString);
    eventDateTime.setHours(hours, minutes, 0, 0);

    return eventDateTime;
  };

  const fetchEventPictures = useCallback(async () => {
    try {
      const pictures = await fetchPictures("event"); // Fetch event pictures
      console.log("Fetched event pictures:", pictures);
      setEventPictures(pictures);
    } catch (error) {
      console.error("Error fetching event pictures:", error);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    const data = await getAllEvents();
    console.log("data: ", data);

    setEvents(data);
    const now = new Date();

    const upcoming = [];
    const past = [];

    data.forEach((event) => {
      const eventEndTime = convertToDateTime(event.date, event.endTime);
      const oneHourAfterEnd = new Date(eventEndTime.getTime() + 60 * 60 * 1000); // End time + 1 hour

      if (now <= oneHourAfterEnd) {
        upcoming.push(event);
      } else {
        past.push(event);
      }
    });

    upcoming.sort(
      (a, b) =>
        convertToDateTime(a.date, a.startTime) -
        convertToDateTime(b.date, b.startTime)
    );

    past.sort(
      (a, b) =>
        convertToDateTime(b.date, b.startTime) -
        convertToDateTime(a.date, a.startTime)
    );

    setUpcomingEvents(upcoming);
    setPastEvents(past);

    console.log("upcoming: ", upcoming);
    console.log("past: ", past);
  }, []);

  // Fetch events when the page is focused
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      if (user.verifiedUser) {
        fetchEvents();
        fetchEventPictures();
      }
    }, [fetchEvents, fetchEventPictures])
  );

  if (!user || !user.verifiedUser) {
    return <Text style={styles.noText}>{i18n.t("notVerified")}</Text>;
  }

  if (!events.length) {
    return <Text style={styles.noText}>{i18n.t("noEvents")}</Text>;
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = { year: "numeric", month: "long", day: "numeric" };
    return date.toLocaleDateString(undefined, options);
  };

  const downloadImage = async (uri) => {
  try {
    if (Platform.OS === 'web') {
      // Browser logic (works because it doesn't use Expo's FileSystem)
      window.open(uri, '_blank');
    } else {
      // MOBILE LOGIC
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permission Denied", "Please allow gallery access.");
        return;
      }

      // Create a simple string for the destination path
      const fileUri = FileSystem.documentDirectory + `event_${Date.now()}.jpg`;

      // In the legacy API, downloadAsync returns a result object
      const downloadResult = await FileSystem.downloadAsync(uri, fileUri);

      // downloadResult.uri is a simple string (e.g., "file:///var/mobile/...")
      if (downloadResult && downloadResult.uri) {
        await MediaLibrary.createAssetAsync(downloadResult.uri);
        Alert.alert("Success", "Image saved to gallery!");
      }
    }
  } catch (error) {
    console.error("Download error:", error);
    Alert.alert("Error", "Failed to save image.");
  }
};

  return (
    <ScrollView style={styles.container}>
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "Upcoming" && styles.tabActive]}
          onPress={() => setActiveTab("Upcoming")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "Upcoming" && styles.tabTextActive,
            ]}
          >
            {i18n.t("upcoming")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "Past" && styles.tabActive]}
          onPress={() => setActiveTab("Past")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "Past" && styles.tabTextActive,
            ]}
          >
            {i18n.t("past")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "Photos" && styles.tabActive]}
          onPress={() => setActiveTab("Photos")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "Photos" && styles.tabTextActive,
            ]}
          >
            {i18n.t("photos")}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "Upcoming" ? (
        <>
          <View style={styles.sectionContainer}>
            {upcomingEvents.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={styles.activityCard}
                onPress={() =>
                  navigation.navigate("Events Detail", { eventId: event.id })
                }
              >
                <View style={styles.activityInfo}>
                  <Text style={styles.activityTitle}>{event.title}</Text>
                  <Text style={styles.activityDetails}>
                    {formatDate(event.date)}
                  </Text>
                  <Text style={styles.activityDetails}>
                    {event.startTime + " - " + event.endTime}
                  </Text>
                  <Text style={styles.activityDetails}>{event.location}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : activeTab === "Past" ? (
        <View style={styles.sectionContainer}>
          {pastEvents.map((event) => (
            <TouchableOpacity
              key={event.id}
              style={styles.activityCard}
              onPress={() =>
                navigation.navigate("Events Detail", { eventId: event.id })
              }
            >
              <View style={styles.activityInfo}>
                <Text style={styles.activityTitle}>{event.title}</Text>
                <Text style={styles.activityDetails}>
                  {formatDate(event.date)}
                </Text>
                <Text style={styles.activityDetails}>
                  {event.startTime + " - " + event.endTime}
                </Text>
                <Text style={styles.activityDetails}>{event.location}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.photosContainer}>
          {eventPictures.length === 0 ? (
            <Text style={styles.noText}>{i18n.t("noPhotos")}</Text>
          ) : (
            <View style={styles.gridContainer}>
              {eventPictures.map((picture, index) => (
                <View key={index} style={styles.imageContainer}>
                  <Image
                    source={{ uri: picture }}
                    style={styles.image}
                    resizeMode="contain"
                    onError={() =>
                      console.error("Error loading image:", picture)
                    }
                  />
                  <TouchableOpacity
                    style={styles.downloadButton}
                    onPress={() => downloadImage(picture)}
                  >
                    <Ionicons name="download-outline" size={20} color="white" />
                  </TouchableOpacity>
                  
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const screenWidth = Dimensions.get('window').width;

// Calculate width based on screen size
// Web/Tablet: ~4-5 images per row | Mobile: 2 images per row

const getImageWidth = () => {
  if (Platform.OS === 'web' && screenWidth > 800) {
    return '23%'; // 4 columns on desktop
  }
  return '48%'; // 2 columns on mobile
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  tabContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
    padding: 5,
    marginHorizontal: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 5,
  },
  tabActive: {
    backgroundColor: "#007AFF",
  },
  tabText: {
    fontSize: 18,
    color: "black",
  },
  tabTextActive: {
    color: "white",
    fontWeight: "bold",
  },
  sectionContainer: {
    paddingHorizontal: 20,
    marginBottom: 15,
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  activityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 5,
    borderLeftColor: "#007AFF",
  },
  activityImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 10,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  activityDetails: {
    fontSize: 18,
    color: "#555",
  },
  noText: {
    textAlign: "center",
    fontSize: 18,
    color: "gray",
    marginTop: 20,
    marginBottom: 20,
  },
  photosContainer: {
    paddingHorizontal: 20,
    width: "100%", // Ensure the container takes full width
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    // Use space-between for mobile to keep the 2-column look clean
    justifyContent: Platform.OS === 'web' ? "flex-start" : "space-between", 
    paddingVertical: 10,
    gap: Platform.OS === 'web' ? 20 : 0, // Gap can mess up % math on some mobile versions
  },
  imageContainer: {
    // Mobile: Strictly 48% (2 per row)
    // Web: 31% (3 per row) with limits
    ...Platform.select({
      ios: {
        width: "48%",
      },
      android: {
        width: "48%",
      },
      web: {
        width: "31%",
        maxWidth: 400,
        minWidth: 200,
      }
    }),
    aspectRatio: 1,
    marginBottom: 15,
    position: 'relative',
  },
  downloadButton: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)", // Semi-transparent black
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
    backgroundColor: '#eee', // Helpful to see the box while loading
  },
});
