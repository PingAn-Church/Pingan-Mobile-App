import React, { useContext, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import Carousel from "../../components/Carousel";
import RoundedSquare from "../../components/RoundedSquare";
import { getAllAnnouncements } from "../../service/AnnouncementService";
import { getAllEvents } from "../../service/EventService";
import { fetchVideos } from "../../service/VideoService";
import { Ionicons } from "@expo/vector-icons";
import PlatformWebView from "../../components/PlatformWebView";
import { resolvePresignedAssetUrl } from "../../service/OSSService";
import { getPublishedCourses } from "../../learning/services/courseService";
import CourseCoverImage from "../../learning/components/CourseCoverImage";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { UserContext } from "../../context/UserContext";
import { formatUserName } from "../../utils/formatName";

// ==========================================
// COMPONENT: HOME PAGE
// ==========================================
export default function HomePage() {
  const navigation = useNavigation();
  const { user } = useContext(UserContext);
  // Subscribing here re-renders the greeting (and every other label) on a language toggle.
  const { language } = useContext(LanguageContext);
  const { width } = useWindowDimensions();

  // Breakpoint for Desktop vs Mobile
  const isDesktop = width >= 768;

  // Constants for responsive sizing
  const MAX_CONTENT_WIDTH = 1100;
  // On Desktop, cap the width. On mobile, use full width.
  const contentWidth = isDesktop ? Math.min(width - 40, MAX_CONTENT_WIDTH) : width;

  // Adjust square size based on screen
  const squareSize = isDesktop ? 110 : width * 0.22;
  const iconSize = squareSize * 0.4;

  const [announcements, setAnnouncements] = useState([]);
  const [events, setEvents] = useState([]);
  const [videos, setVideos] = useState([]);
  const [announcementImages, setAnnouncementImages] = useState({});
  const [courses, setCourses] = useState([]);

  const convertToDateTime = (dateString, timeString) => {
    if (!dateString || !timeString) return NaN;
    timeString = timeString.replace(/\u202F/g, " ").trim();
    const timeRegex = /^(\d{1,2}):(\d{2})\s?(AM|PM)$/;
    const match = timeString.match(timeRegex);
    if (!match) return NaN;
    let [, hours, minutes, modifier] = match;
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10);
    if (modifier === "PM" && hours !== 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;
    const eventDateTime = new Date(dateString);
    eventDateTime.setHours(hours, minutes, 0, 0);
    return eventDateTime;
  };

  useFocusEffect(
    useCallback(() => {
      loadVideos();
      loadAnnouncements();
      if (user) loadEvents();
      else setEvents([]);
      loadCourses();
    }, [isDesktop, user?.id])
  );

  const loadCourses = async () => {
    try {
      const { courses } = await getPublishedCourses({ limit: 8 });
      setCourses(courses);
    } catch (error) { console.error(error); }
  };

  const loadAnnouncements = async () => {
    try {
      const data = await getAllAnnouncements();
      setAnnouncements(data);
      const pairs = await Promise.all(
        data.map(async (announcement) => {
          if (!announcement?.imageUrl) return [announcement.id, null];
          return [
            announcement.id,
            await resolvePresignedAssetUrl(announcement.imageUrl, "announcement"),
          ];
        })
      );
      setAnnouncementImages(Object.fromEntries(pairs));
    } catch (error) { console.error(error); }
  };

  const getImageForAnnouncement = (announcement) => {
    return announcementImages[announcement.id] || null;
  };

  const loadEvents = async () => {
    try {
      const response = await getAllEvents({
        status: "upcoming",
        size: isDesktop ? 4 : 3,
        sort: "startAt,asc",
      });
      setEvents(Array.isArray(response?.data) ? response.data : []);
    } catch (error) { console.error(error); }
  };

  const loadVideos = async () => {
    try {
      const response = await fetchVideos({ size: isDesktop ? 4 : 3 });
      setVideos(Array.isArray(response?.data) ? response.data : []);
    } catch (error) { console.error(error); }
  };

  const getEmbedUrl = (videoId, type) => {
    return type === "YouTube"
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : `https://v.qq.com/txp/iframe/player.html?vid=${videoId}`;
  };

  // Greeting line: the Lord's Day gets its own blessing, other days a plain hello.
  // getDay() reads the device's local calendar (0 = Sunday). Signed-out visitors see
  // the bare greeting, with no dangling comma.
  const greeting = i18n.t(new Date().getDay() === 0 ? "greetingSunday" : "greetingHello");
  const greetingName = formatUserName(user, language);
  const greetingLine = greetingName
    ? i18n.t("greetingWithName", { greeting, name: greetingName })
    : greeting;

  return (
    <ScrollView
      style={styles.mainScroll}
      contentContainerStyle={styles.scrollContentContainer}
    >
      <View style={[styles.responsiveWrapper, { width: contentWidth }]}>

        {/* Section 1: Announcements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{i18n.t("announcements")}</Text>
          <View style={isDesktop ? styles.carouselWebContainer : null}>
            <Carousel
              data={announcements.map((announcement) => ({
                key: announcement.id.toString(),
                imageUrl: getImageForAnnouncement(announcement),
                description: announcement.title,
                link: announcement.announcementLink
              }))}
            />
          </View>
        </View>

        {/* Section 2: Quick Actions (Grid) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{greetingLine}</Text>
          <ScrollView
            horizontal={!isDesktop}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={isDesktop ? styles.gridWebContainer : styles.gridMobileContainer}
          >
            {[
              { icon: "description", color: "#009688", label: "applyForm", screen: "FormApplication" },
              { icon: "public", color: "#4CAF50", label: "website", url: "https://www.pingan.org.sg" },
              { icon: "play-arrow", color: "#F44336", label: "youtube", url: "https://www.youtube.com/@Pinganchurch" },
              { icon: "place", color: "#2196F3", label: "location", url: "https://maps.app.goo.gl/87euaduDeRSA5JMN6" },
              { icon: "phone", color: "#FFC107", label: "phoneNumber", url: "tel:+6580390059" },
              { icon: "email", color: "#673AB7", label: "email", url: "mailto:pinganchurchsingapore@gmail.com" },
            ].filter((item) => user || item.screen !== "FormApplication").map((item, idx) => (
              <RoundedSquare
                key={idx}
                iconName={item.icon}
                iconSize={iconSize}
                backgroundColor={item.color}
                iconColor="#fff"
                size={squareSize}
                description={i18n.t(item.label)}
                navigationScreen={item.screen}
                webUrl={item.url}
              />
            ))}
          </ScrollView>
        </View>

        {/* Section: Learning */}
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>{i18n.t("learning")}</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Learning")}>
              <Text style={styles.viewAllText}>{`${i18n.t("viewAll")} →`}</Text>
            </TouchableOpacity>
          </View>
          {courses.length > 0 ? (
            <ScrollView
              horizontal={!isDesktop}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={isDesktop ? styles.flexRowWrap : styles.flexRow}
            >
              {courses.map((course) => (
                <TouchableOpacity
                  key={course.id}
                  style={styles.courseCard}
                  onPress={() =>
                    navigation.navigate("LearningCourseDetail", { courseId: course.id })
                  }
                >
                  <CourseCoverImage
                    uri={course.thumbnailUrl}
                    fallback="https://picsum.photos/seed/course/400/250"
                    style={styles.courseImage}
                  />
                  <Text style={styles.courseTitle} numberOfLines={2}>
                    {course.title}
                  </Text>
                  <Text style={styles.courseMeta} numberOfLines={1}>
                    {course.categoryName} • {course.durationHours}h
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.noData}>{i18n.t("noCourses")}</Text>
          )}
        </View>

        {/* Section 3: Events */}
        {user && <View style={styles.section}>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>{i18n.t("upcoming")} {i18n.t("Events")}</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Events")}>
              <Text style={styles.viewAllText}>
                {isDesktop ? `${i18n.t("viewAll")} →` : null}
              </Text>
            </TouchableOpacity>
          </View>

          {events.length > 0 ? (
            <View style={styles.eventRowWrapper}>
              <ScrollView
                horizontal={!isDesktop}
                showsHorizontalScrollIndicator={false}
              >
                <View style={isDesktop ? styles.flexRowWrap : styles.flexRow}>
                  {events.map((event, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[styles.cardContainer, isDesktop && styles.cardContainerWeb]}
                      onPress={() => navigation.navigate("Events Detail", { eventId: event.id })}
                    >
                      <View style={styles.eventBox}>
                        <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                        <Text style={styles.eventDate}>{event.date}</Text>
                        <Text style={styles.eventTime}>{event.startTime} - {event.endTime}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Mobile Arrow */}
              {!isDesktop && (
                <TouchableOpacity style={styles.mobileArrow} onPress={() => navigation.navigate("Events")}>
                  <Ionicons name="chevron-forward" size={20} color="white" />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <Text style={styles.noData}>{i18n.t("noUpcomingEvents")}</Text>
          )}
        </View>}

        {/* Section 4: Videos */}
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>{i18n.t("videos")}</Text>
            <TouchableOpacity onPress={() => navigation.navigate("VideosPage")}>
              <Text style={styles.viewAllText}>{isDesktop ? `${i18n.t("viewAll")} →` : null}</Text>
            </TouchableOpacity>
          </View>

          {videos.length > 0 ? (
            <View style={styles.videoRowWrapper}>
              <ScrollView horizontal={!isDesktop} showsHorizontalScrollIndicator={false}>
                <View style={isDesktop ? styles.videoGridWeb : styles.flexRow}>
                  {videos.map((video, index) => (
                    <View key={index} style={[styles.videoItem, isDesktop && styles.videoItemWeb]}>
                      <View style={[styles.videoWrapper, Platform.OS === 'web' && styles.videoWrapperWebHome]}>
                        <PlatformWebView
                          source={{ uri: getEmbedUrl(video.videoId, video.videoType) }}
                          style={styles.video}
                          javaScriptEnabled
                          domStorageEnabled
                          scrollEnabled={false} // Important for Web iframe stability
                        />
                      </View>
                      <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>

              {/* Mobile Arrow */}
              {!isDesktop && (
                <TouchableOpacity
                  style={styles.mobileArrow}
                  onPress={() => navigation.navigate("VideosPage")}
                >
                  <Ionicons name="chevron-forward" size={20} color="white" />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <Text style={styles.noData}>{i18n.t("noVideos")}</Text>
          )}
        </View>

      </View>
    </ScrollView>
  );
}

// ==========================================
// COMPONENT: VIDEOS PAGE (Restored)
// ==========================================
export function VideosPage() {
  const navigation = useNavigation();
  const [videos, setVideos] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const { language } = useContext(LanguageContext);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const pageSize = isDesktop ? 8 : 5;

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("videos"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  const getEmbedUrl = (videoId, type) => {
    return type === "YouTube"
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : `https://v.qq.com/txp/iframe/player.html?vid=${videoId}`;
  };

  const loadVideosPage = useCallback(
    async (nextPage = 0, replace = false) => {
      setLoading(true);
      try {
        const response = await fetchVideos({ page: nextPage, size: pageSize });
        const items = Array.isArray(response?.data) ? response.data : [];
        setVideos((prev) => (replace ? items : [...prev, ...items.filter((v) => !prev.some((p) => p.id === v.id))]));
        setPage(Number.isFinite(Number(response?.pagination?.page)) ? Number(response.pagination.page) : nextPage);
        setHasMore(Boolean(response?.pagination?.hasMore));
      } catch (error) {
        console.error("Error fetching videos:", error);
      } finally {
        setLoading(false);
      }
    },
    [pageSize]
  );

  useFocusEffect(
    useCallback(() => {
      setVideos([]);
      setPage(0);
      setHasMore(true);
      loadVideosPage(0, true);
    }, [loadVideosPage])
  );

  const loadMoreVideos = () => {
    if (!loading && hasMore) {
      loadVideosPage(page + 1, false);
    }
  };

  return (
    <FlatList
      contentContainerStyle={styles.videosPageContainer}
      data={videos}
      keyExtractor={(item) => String(item.id)}
      onEndReached={loadMoreVideos}
      onEndReachedThreshold={0.3}
      ListFooterComponent={loading ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
      ListEmptyComponent={!loading ? <Text style={styles.noData}>{i18n.t("noVideos")}</Text> : null}
      renderItem={({ item: video }) => (
        // Math.min keeps the 800px column inside 768-834dp tablet-portrait windows.
        <View style={{ width: isDesktop ? Math.min(800, width - 32) : '100%', alignItems: 'center' }}>
          <View style={[styles.videoItem, { width: isDesktop ? '100%' : width * 0.9 }, Platform.OS === 'web' && isDesktop && styles.videosPageVideoItemWeb]}>
            <View style={[styles.videoWrapper, Platform.OS === 'web' && isDesktop && styles.videoWrapperWebAllVideos]}>
              <PlatformWebView
                source={{ uri: getEmbedUrl(video.videoId, video.videoType) }}
                style={styles.video}
                javaScriptEnabled
                domStorageEnabled
              />
            </View>
            <Text style={styles.videoTitle}>{video.title}</Text>
          </View>
        </View>
      )}
    />
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  mainScroll: {
    flex: 1, // Critical for Web to fill height
    backgroundColor: "#fff",
  },
  scrollContentContainer: {
    alignItems: "center",
    paddingBottom: 40,
    flexGrow: 1,
  },
  responsiveWrapper: {
    paddingHorizontal: Platform.OS === 'web' ? 20 : 0,
    alignSelf: 'center',
  },
  section: {
    marginTop: 30,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 15,
    marginLeft: 15, // Match mobile padding
    color: "#333",
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 20,
  },
  viewAllText: {
    color: 'blue',
    fontWeight: '600',
    fontSize: 16,
  },

  // Carousel
  carouselWebContainer: {
    borderRadius: 15,
    overflow: 'hidden',
    height: 400,
    marginHorizontal: 15,
  },

  // Grid
  gridWebContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: 20,
    paddingLeft: 15,
  },
  gridMobileContainer: {
    flexDirection: 'row',
    paddingLeft: 10, // Match original look
  },

  // Events
  eventRowWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  flexRow: {
    flexDirection: 'row',
    paddingLeft: 5,
  },
  flexRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
    paddingLeft: 15,
  },
  cardContainer: {
    width: 240,
    marginHorizontal: 5,
  },
  cardContainerWeb: {
    width: '23%',
    minWidth: 200,
    marginHorizontal: 0,
  },
  eventBox: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: "#eee",
    // Shadow for iOS/Android/Web
    ...Platform.select({
      web: { boxShadow: '0px 4px 6px rgba(0,0,0,0.05)' },
      default: {
        elevation: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      }
    })
  },
  eventTitle: { fontSize: 17, fontWeight: "bold", color: "#222", marginBottom: 8 },
  eventDate: { fontSize: 14, color: "#666" },
  eventTime: { fontSize: 14, color: "#007AFF", marginTop: 4, fontWeight: '600' },

  // Videos
  videoRowWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  videoGridWeb: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 20,
    paddingHorizontal: 15,
    width: '100%',
  },
  videoItem: {
    width: 300, // Mobile width
    marginHorizontal: 10,
    marginBottom: 20,
  },
  videoItemWeb: {
    flex: 1,
    marginHorizontal: 0,
    maxWidth: 280,
  },
  videoWrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  videoWrapperWebHome: {
    height: 160,
  },
  videoWrapperWebAllVideos: {
    height: 250,
  },
  video: {
    flex: 1,
    // Ensures iframe fills container on web
    height: '100%',
    width: '100%'
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 10,
    color: "#333",
    textAlign: "left",
    lineHeight: 22,
  },

  // Videos Page specific
  videosPageContainer: {
    flexGrow: 1,
    backgroundColor: "#f9f9f9",
    padding: 20,
    alignItems: "center",
  },
  videosPageVideoItemWeb: {
    maxWidth: 560,
  },

  // Learning
  courseCard: {
    width: 220,
    marginHorizontal: 8,
    marginBottom: 10,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#eee",
  },
  courseImage: {
    width: "100%",
    height: 120,
    backgroundColor: "#ddd",
  },
  courseTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#222",
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  courseMeta: {
    fontSize: 13,
    color: "#666",
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 2,
  },

  // Shared
  mobileArrow: {
    backgroundColor: "#007bff",
    padding: 10,
    borderRadius: 30,
    marginLeft: 5,
    marginRight: 10,
  },
  noData: { fontSize: 16, color: "gray", padding: 20 },
});
