import React, { useContext, useEffect, useState, useCallback } from "react";
import {
  View,
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
import { getPublishedCourses } from "../../learning/services/courseService";
import CourseCoverImage from "../../learning/components/CourseCoverImage";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { UserContext } from "../../context/UserContext";
import { formatUserName } from "../../utils/formatName";
import { makeStyles, useTheme } from "../../theme";
import { AppText, Card, Heading, TextLink } from "../../components/ui";

// ==========================================
// COMPONENT: HOME PAGE
// ==========================================
export default function HomePage() {
  const styles = useStyles();
  const { colors } = useTheme();
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
  const contentWidth = isDesktop
    ? Math.min(width - 40, MAX_CONTENT_WIDTH)
    : width;

  // Adjust square size based on screen
  const squareSize = isDesktop ? 110 : width * 0.22;
  const iconSize = squareSize * 0.4;

  const [announcements, setAnnouncements] = useState([]);
  const [events, setEvents] = useState([]);
  const [videos, setVideos] = useState([]);
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
    }, [isDesktop, user?.id]),
  );

  const loadCourses = async () => {
    try {
      const { courses } = await getPublishedCourses({ limit: 8 });
      setCourses(courses);
    } catch (error) {
      console.error(error);
    }
  };

  // Covers are handed to the carousel as their stored object path and resolved by
  // CachedImage, not signed here. Signing produces a single-use URL, so doing it
  // on every focus gave the same poster a new identity each visit — nothing could
  // cache it and it visibly reloaded on every return to this page.
  const loadAnnouncements = async () => {
    try {
      setAnnouncements(await getAllAnnouncements());
    } catch (error) {
      console.error(error);
    }
  };

  const loadEvents = async () => {
    try {
      const response = await getAllEvents({
        status: "upcoming",
        size: isDesktop ? 4 : 3,
        sort: "startAt,asc",
      });
      setEvents(Array.isArray(response?.data) ? response.data : []);
    } catch (error) {
      console.error(error);
    }
  };

  const loadVideos = async () => {
    try {
      const response = await fetchVideos({ size: isDesktop ? 4 : 3 });
      setVideos(Array.isArray(response?.data) ? response.data : []);
    } catch (error) {
      console.error(error);
    }
  };

  const getEmbedUrl = (videoId, type) => {
    return type === "YouTube"
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : `https://v.qq.com/txp/iframe/player.html?vid=${videoId}`;
  };

  // Greeting line: the Lord's Day gets its own blessing, other days a plain hello.
  // getDay() reads the device's local calendar (0 = Sunday). Signed-out visitors see
  // the bare greeting, with no dangling comma.
  const greeting = i18n.t(
    new Date().getDay() === 0 ? "greetingSunday" : "greetingHello",
  );
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
        {/* Section 1: Announcements. Hidden entirely when there are none, rather
            than leaving a heading above an empty carousel. This also covers the
            initial render, since announcements load asynchronously. */}
        {announcements.length > 0 && (
          <View style={styles.section}>
            <Heading style={styles.sectionTitle}>
              {i18n.t("announcements")}
            </Heading>
            <View style={isDesktop ? styles.carouselWebContainer : null}>
              <Carousel
                data={announcements.map((announcement) => ({
                  key: announcement.id.toString(),
                  imageUrl: announcement.imageUrl || null,
                  description: announcement.title,
                  link: announcement.announcementLink,
                }))}
              />
            </View>
          </View>
        )}

        {/* Section 2: Quick Actions (Grid) */}
        <View style={styles.section}>
          <Heading style={styles.sectionTitle}>{greetingLine}</Heading>
          <ScrollView
            horizontal={!isDesktop}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={
              isDesktop ? styles.gridWebContainer : styles.gridMobileContainer
            }
          >
            {[
              {
                icon: "description",
                color: colors.tiles.form,
                label: "applyForm",
                screen: "FormApplication",
              },
              {
                icon: "stars",
                color: colors.tiles.gifts,
                label: "giftDiscovery",
                screen: "GiftDiscovery",
              },
              {
                icon: "public",
                color: colors.tiles.website,
                label: "website",
                url: "https://www.pingan.org.sg",
              },
              {
                icon: "play-arrow",
                color: colors.tiles.youtube,
                label: "youtube",
                url: "https://www.youtube.com/@Pinganchurch",
              },
              // Magenta is the one hue not already on this row, so the counselling
              // booking reads as its own thing rather than a second video or map tile.
              // Ionicons for the glyph, so it is the same speech bubble the Chats tab
              // uses rather than a lookalike from a different set.
              {
                icon: "chatbubble",
                iconFamily: "ion",
                color: colors.tiles.consultation,
                label: "consultation",
                url: "https://booking.pingan.org.sg/",
              },
              {
                icon: "place",
                color: colors.tiles.location,
                label: "location",
                url: "https://maps.app.goo.gl/87euaduDeRSA5JMN6",
              },
              {
                icon: "phone",
                color: colors.tiles.phone,
                label: "phoneNumber",
                url: "tel:+6580390059",
              },
              {
                icon: "email",
                color: colors.tiles.email,
                label: "email",
                url: "mailto:pinganchurchsingapore@gmail.com",
              },
            ]
              .filter((item) => user || item.screen !== "FormApplication")
              .map((item, idx) => (
                <RoundedSquare
                  key={idx}
                  iconName={item.icon}
                  iconFamily={item.iconFamily}
                  iconSize={iconSize}
                  backgroundColor={item.color}
                  iconColor={colors.onPrimary}
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
            <Heading style={styles.sectionTitle}>{i18n.t("learning")}</Heading>
            <TextLink onPress={() => navigation.navigate("Learning")}>
              {`${i18n.t("viewAll")} →`}
            </TextLink>
          </View>
          {courses.length > 0 ? (
            <ScrollView
              horizontal={!isDesktop}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={
                isDesktop ? styles.flexRowWrap : styles.flexRow
              }
            >
              {courses.map((course) => (
                <Card
                  key={course.id}
                  padded={false}
                  style={styles.courseCard}
                  onPress={() =>
                    navigation.navigate("LearningCourseDetail", {
                      courseId: course.id,
                    })
                  }
                >
                  <CourseCoverImage
                    uri={course.thumbnailUrl}
                    fallback="https://picsum.photos/seed/course/400/250"
                    style={styles.courseImage}
                  />
                  <AppText
                    variant="cardTitleSmall"
                    style={styles.courseTitle}
                    numberOfLines={2}
                  >
                    {course.title}
                  </AppText>
                  <AppText
                    variant="captionSmall"
                    style={styles.courseMeta}
                    numberOfLines={1}
                  >
                    {course.categoryName} • {course.durationHours}h
                  </AppText>
                </Card>
              ))}
            </ScrollView>
          ) : (
            <AppText variant="empty" style={styles.noData}>
              {i18n.t("noCourses")}
            </AppText>
          )}
        </View>

        {/* Section 3: Events */}
        {user && (
          <View style={styles.section}>
            <View style={styles.headerRow}>
              <Heading style={styles.sectionTitle}>
                {i18n.t("upcoming")} {i18n.t("Events")}
              </Heading>
              <TextLink onPress={() => navigation.navigate("Events")}>
                {isDesktop ? `${i18n.t("viewAll")} →` : null}
              </TextLink>
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
                        style={[
                          styles.cardContainer,
                          isDesktop && styles.cardContainerWeb,
                        ]}
                        onPress={() =>
                          navigation.navigate("Events Detail", {
                            eventId: event.id,
                          })
                        }
                      >
                        <Card elevated style={styles.eventBox}>
                          <AppText
                            variant="cardTitle"
                            style={styles.eventTitle}
                            numberOfLines={1}
                          >
                            {event.title}
                          </AppText>
                          <AppText variant="caption">{event.date}</AppText>
                          <AppText
                            variant="caption"
                            color="primary"
                            weight="semibold"
                            style={styles.eventTime}
                          >
                            {event.startTime} - {event.endTime}
                          </AppText>
                        </Card>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {/* Mobile Arrow */}
                {!isDesktop && (
                  <TouchableOpacity
                    style={styles.mobileArrow}
                    onPress={() => navigation.navigate("Events")}
                    accessibilityRole="button"
                    accessibilityLabel={i18n.t("viewAll")}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={colors.onPrimary}
                    />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <AppText variant="empty" style={styles.noData}>
                {i18n.t("noUpcomingEvents")}
              </AppText>
            )}
          </View>
        )}

        {/* Section 4: Videos */}
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Heading style={styles.sectionTitle}>{i18n.t("videos")}</Heading>
            <TextLink onPress={() => navigation.navigate("VideosPage")}>
              {isDesktop ? `${i18n.t("viewAll")} →` : null}
            </TextLink>
          </View>

          {videos.length > 0 ? (
            <View style={styles.videoRowWrapper}>
              <ScrollView
                horizontal={!isDesktop}
                showsHorizontalScrollIndicator={false}
              >
                <View style={isDesktop ? styles.videoGridWeb : styles.flexRow}>
                  {videos.map((video, index) => (
                    <View
                      key={index}
                      style={[
                        styles.videoItem,
                        isDesktop && styles.videoItemWeb,
                      ]}
                    >
                      <View
                        style={[
                          styles.videoWrapper,
                          Platform.OS === "web" && styles.videoWrapperWebHome,
                        ]}
                      >
                        <PlatformWebView
                          source={{
                            uri: getEmbedUrl(video.videoId, video.videoType),
                          }}
                          style={styles.video}
                          javaScriptEnabled
                          domStorageEnabled
                          scrollEnabled={false} // Important for Web iframe stability
                        />
                      </View>
                      <AppText
                        variant="bodyStrong"
                        style={styles.videoTitle}
                        numberOfLines={2}
                      >
                        {video.title}
                      </AppText>
                    </View>
                  ))}
                </View>
              </ScrollView>

              {/* Mobile Arrow */}
              {!isDesktop && (
                <TouchableOpacity
                  style={styles.mobileArrow}
                  onPress={() => navigation.navigate("VideosPage")}
                  accessibilityRole="button"
                  accessibilityLabel={i18n.t("viewAll")}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.onPrimary}
                  />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <AppText variant="empty" style={styles.noData}>
              {i18n.t("noVideos")}
            </AppText>
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
  const styles = useStyles();
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
        setVideos((prev) =>
          replace
            ? items
            : [
                ...prev,
                ...items.filter((v) => !prev.some((p) => p.id === v.id)),
              ],
        );
        setPage(
          Number.isFinite(Number(response?.pagination?.page))
            ? Number(response.pagination.page)
            : nextPage,
        );
        setHasMore(Boolean(response?.pagination?.hasMore));
      } catch (error) {
        console.error("Error fetching videos:", error);
      } finally {
        setLoading(false);
      }
    },
    [pageSize],
  );

  useFocusEffect(
    useCallback(() => {
      setVideos([]);
      setPage(0);
      setHasMore(true);
      loadVideosPage(0, true);
    }, [loadVideosPage]),
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
      ListFooterComponent={
        loading ? <ActivityIndicator style={styles.loadingMore} /> : null
      }
      ListEmptyComponent={
        !loading ? (
          <AppText variant="empty" style={styles.noData}>
            {i18n.t("noVideos")}
          </AppText>
        ) : null
      }
      renderItem={({ item: video }) => (
        // Math.min keeps the 800px column inside 768-834dp tablet-portrait windows.
        <View
          style={{
            width: isDesktop ? Math.min(800, width - 32) : "100%",
            alignItems: "center",
          }}
        >
          <View
            style={[
              styles.videoItem,
              { width: isDesktop ? "100%" : width * 0.9 },
              Platform.OS === "web" &&
                isDesktop &&
                styles.videosPageVideoItemWeb,
            ]}
          >
            <View
              style={[
                styles.videoWrapper,
                Platform.OS === "web" &&
                  isDesktop &&
                  styles.videoWrapperWebAllVideos,
              ]}
            >
              <PlatformWebView
                source={{ uri: getEmbedUrl(video.videoId, video.videoType) }}
                style={styles.video}
                javaScriptEnabled
                domStorageEnabled
              />
            </View>
            <AppText variant="bodyStrong" style={styles.videoTitle}>
              {video.title}
            </AppText>
          </View>
        </View>
      )}
    />
  );
}

// ==========================================
// STYLES
// ==========================================
// Fixed layout sizes for this screen. Colours, text, spacing, radius and
// shadows come from the theme; only these screen-specific dimensions stay here.
const EVENT_CARD_WIDTH = 240;
const COURSE_CARD_WIDTH = 220;
const COURSE_IMAGE_HEIGHT = 120;
const VIDEO_ITEM_WIDTH = 300;

const useStyles = makeStyles((t) => ({
  mainScroll: {
    flex: 1, // Critical for Web to fill height
    backgroundColor: t.colors.background,
  },
  scrollContentContainer: {
    alignItems: "center",
    paddingBottom: t.spacing["4xl"],
    flexGrow: 1,
  },
  responsiveWrapper: {
    paddingHorizontal: Platform.OS === "web" ? t.spacing["2xl"] : 0,
    alignSelf: "center",
  },
  section: {
    marginTop: t.spacing["3xl"],
    width: "100%",
  },
  // Text style comes from <Heading>; this is only its position.
  sectionTitle: {
    marginBottom: t.spacing.lg,
    marginLeft: t.spacing.lg, // Match mobile padding
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingRight: t.spacing["2xl"],
  },

  // Carousel. No height: the carousel sizes itself to the tallest announcement
  // (each card follows its own picture's aspect ratio), so pinning it here would
  // crop whatever doesn't fit the old 400px box.
  carouselWebContainer: {
    borderRadius: t.radius.lg,
    overflow: "hidden",
    marginHorizontal: t.spacing.lg,
  },

  // Grid
  gridWebContainer: {
    flexDirection: "row",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    gap: t.spacing["2xl"],
    paddingLeft: t.spacing.lg,
  },
  gridMobileContainer: {
    flexDirection: "row",
    paddingLeft: t.spacing.base, // Match original look
  },

  // Events
  eventRowWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  flexRow: {
    flexDirection: "row",
    paddingLeft: t.spacing.sm,
  },
  flexRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: t.spacing.lg,
    paddingLeft: t.spacing.lg,
  },
  cardContainer: {
    width: EVENT_CARD_WIDTH,
    marginHorizontal: t.spacing.sm,
  },
  cardContainerWeb: {
    width: "23%",
    minWidth: 200,
    marginHorizontal: 0,
  },
  // Look comes from <Card elevated>; this is only its position.
  eventBox: {
    marginVertical: t.spacing.sm,
  },
  eventTitle: {
    marginBottom: t.spacing.md,
  },
  eventTime: {
    marginTop: t.spacing.xs,
  },

  // Videos
  videoRowWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  videoGridWeb: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: t.spacing["2xl"],
    paddingHorizontal: t.spacing.lg,
    width: "100%",
  },
  videoItem: {
    width: VIDEO_ITEM_WIDTH, // Mobile width
    marginHorizontal: t.spacing.base,
    marginBottom: t.spacing["2xl"],
  },
  videoItemWeb: {
    flex: 1,
    marginHorizontal: 0,
    maxWidth: 280,
  },
  videoWrapper: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: t.radius.md,
    overflow: "hidden",
    backgroundColor: t.colors.media,
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
    height: "100%",
    width: "100%",
  },
  videoTitle: {
    marginTop: t.spacing.base,
    textAlign: "left",
  },

  // Videos Page specific
  videosPageContainer: {
    flexGrow: 1,
    backgroundColor: t.colors.backgroundAlt,
    padding: t.spacing["2xl"],
    alignItems: "center",
  },
  videosPageVideoItemWeb: {
    maxWidth: 560,
  },
  loadingMore: {
    marginVertical: t.spacing.xl,
  },

  // Learning — look comes from <Card padded={false}>; this is size and position.
  courseCard: {
    width: COURSE_CARD_WIDTH,
    marginHorizontal: t.spacing.md,
    marginBottom: t.spacing.base,
    overflow: "hidden",
  },
  courseImage: {
    width: "100%",
    height: COURSE_IMAGE_HEIGHT,
    backgroundColor: t.colors.placeholder,
  },
  courseTitle: {
    paddingHorizontal: t.spacing.base,
    paddingTop: t.spacing.md,
  },
  courseMeta: {
    paddingHorizontal: t.spacing.base,
    paddingBottom: t.spacing.base,
    paddingTop: t.spacing["2xs"],
  },

  // Shared
  mobileArrow: {
    backgroundColor: t.colors.primary,
    padding: t.spacing.base,
    borderRadius: t.radius.full,
    marginLeft: t.spacing.sm,
    marginRight: t.spacing.base,
  },
  noData: {
    padding: t.spacing["2xl"],
  },
}));
