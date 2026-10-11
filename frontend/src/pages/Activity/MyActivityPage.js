import React, { useCallback, useContext, useMemo, useState } from "react";
import {
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from "react-native";
import { getAllEvents } from "../../service/EventService";
import { UserContext } from "../../context/UserContext";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { fetchPictures } from "../../service/OSSService";
import CachedImage from "../../components/CachedImage";
import i18n from "../../../i18n";
import { Ionicons } from "@expo/vector-icons";
import { showAlert } from "../../utils/showAlert";
import {
  MEDIA_LIBRARY_PERMISSION_DENIED,
  downloadImageToLibrary,
} from "../../utils/mediaLibrary";
import { makeStyles, useTheme } from "../../theme";
import { AppText, Button, Card } from "../../components/ui";

const EVENT_PAGE_SIZE = 20;
const PHOTO_PAGE_SIZE = 30;

const pad = (value) => String(value).padStart(2, "0");

/**
 * Gallery name for a saved event photo, e.g. "event-photo-20260802-153045.jpg".
 * The stored object keys are opaque (owner prefix + random token), so a local
 * timestamp is both friendlier to read and naturally sorted in the gallery.
 */
const buildEventPhotoFileName = (uri) => {
  const extension = String(uri || "").split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  const safeExtension = /^[a-z0-9]{1,5}$/.test(extension || "") ? extension : "jpg";
  const now = new Date();
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `event-photo-${stamp}.${safeExtension}`;
};

const emptyPage = () => ({
  items: [],
  page: 0,
  marker: null,
  hasMore: true,
  loading: false,
});

export default function MyActivityPage() {
  const styles = useStyles();
  const { colors, sizes } = useTheme();
  const [activeTab, setActiveTab] = useState("Upcoming");
  const [upcomingEvents, setUpcomingEvents] = useState(emptyPage);
  const [pastEvents, setPastEvents] = useState(emptyPage);
  const [eventPictures, setEventPictures] = useState(emptyPage);
  const [tabErrors, setTabErrors] = useState({});
  const { user } = useContext(UserContext);
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  // 3 photo columns on wide screens (tablets/desktop), 2 otherwise; the list is
  // re-keyed below because FlatList can't change numColumns on the fly.
  const numColumns = activeTab === "Photos" ? (width > 800 ? 3 : 2) : 1;

  const pageForTab = useMemo(
    () =>
      activeTab === "Upcoming"
        ? upcomingEvents
        : activeTab === "Past"
          ? pastEvents
          : eventPictures,
    [activeTab, upcomingEvents, pastEvents, eventPictures]
  );

  const setPageForTab = (tab, updater) => {
    const setter =
      tab === "Upcoming" ? setUpcomingEvents : tab === "Past" ? setPastEvents : setEventPictures;
    setter(updater);
  };

  const loadTab = useCallback(
    async (tab = activeTab, replace = false) => {
      if (!user?.verifiedUser) return;
      const current = tab === "Upcoming" ? upcomingEvents : tab === "Past" ? pastEvents : eventPictures;
      if (!replace && (current.loading || !current.hasMore)) return;

      setTabErrors((prev) => ({ ...prev, [tab]: false }));
      setPageForTab(tab, (prev) => ({ ...prev, loading: true }));
      try {
        if (tab === "Photos") {
          const response = await fetchPictures("event", {
            size: PHOTO_PAGE_SIZE,
            marker: replace ? null : current.marker,
          });
          const items = Array.isArray(response?.data) ? response.data : [];
          setEventPictures((prev) => ({
            items: replace ? items : [...prev.items, ...items.filter((uri) => !prev.items.includes(uri))],
            marker: response?.pagination?.nextMarker || null,
            page: replace ? 0 : prev.page + 1,
            hasMore: Boolean(response?.pagination?.hasMore),
            loading: false,
          }));
          return;
        }

        const response = await getAllEvents({
          status: tab === "Past" ? "past" : "upcoming",
          page: replace ? 0 : current.page + 1,
          size: EVENT_PAGE_SIZE,
          sort: tab === "Past" ? "startAt,desc" : "startAt,asc",
        });
        const items = Array.isArray(response?.data) ? response.data : [];
        setPageForTab(tab, (prev) => ({
          items: replace ? items : [...prev.items, ...items.filter((event) => !prev.items.some((p) => p.id === event.id))],
          page: Number.isFinite(Number(response?.pagination?.page))
            ? Number(response.pagination.page)
            : replace ? 0 : prev.page + 1,
          marker: null,
          hasMore: Boolean(response?.pagination?.hasMore),
          loading: false,
        }));
      } catch (error) {
        console.error("Failed to load activity page:", error);
        setTabErrors((prev) => ({ ...prev, [tab]: true }));
        setPageForTab(tab, (prev) => ({ ...prev, loading: false }));
      }
    },
    [activeTab, eventPictures, pastEvents, upcomingEvents, user]
  );

  useFocusEffect(
    useCallback(() => {
      if (!user?.verifiedUser) return;
      setUpcomingEvents(emptyPage());
      setPastEvents(emptyPage());
      setEventPictures(emptyPage());
      setTabErrors({});
      loadTab(activeTab, true);
    }, [activeTab, user?.id, user?.verifiedUser])
  );

  if (!user || !user.verifiedUser) {
    return (
      <AppText variant="body" color="textSecondary" style={styles.noText}>
        {i18n.t("notVerified")}
      </AppText>
    );
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = { year: "numeric", month: "long", day: "numeric" };
    return date.toLocaleDateString(undefined, options);
  };

  const downloadImage = async (uri) => {
    try {
      if (Platform.OS === "web") {
        window.open(uri, "_blank");
        return;
      }

      await downloadImageToLibrary(uri, buildEventPhotoFileName(uri));
      showAlert(i18n.t("success"), i18n.t("saveImageSuccess"));
    } catch (error) {
      console.error("Download error:", error);
      showAlert(
        i18n.t("error"),
        error?.message === MEDIA_LIBRARY_PERMISSION_DENIED
          ? i18n.t("needPhotoAccess")
          : i18n.t("saveImageFailed")
      );
    }
  };

  const tabs = (
    <View style={styles.tabContainer}>
      {["Upcoming", "Past", "Photos"].map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[styles.tab, activeTab === tab && styles.tabActive]}
          onPress={() => setActiveTab(tab)}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === tab }}
        >
          <AppText
            variant="bodyLarge"
            color={activeTab === tab ? "onPrimary" : "textPrimary"}
            weight={activeTab === tab ? "bold" : undefined}
          >
            {tab === "Upcoming" ? i18n.t("upcoming") : tab === "Past" ? i18n.t("past") : i18n.t("photos")}
          </AppText>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderEvent = ({ item }) => (
    <Card
      accent
      style={styles.activityCard}
      onPress={() => navigation.navigate("Events Detail", { eventId: item.id })}
    >
      <AppText variant="cardTitle">{item.title}</AppText>
      <AppText variant="bodyLarge">{formatDate(item.date)}</AppText>
      <AppText variant="bodyLarge">{item.startTime + " - " + item.endTime}</AppText>
      <AppText variant="bodyLarge">{item.location}</AppText>
    </Card>
  );

  const renderPhoto = ({ item }) => (
    <View
      style={[
        styles.imageContainer,
        numColumns === 3 ? styles.imageContainerThreeCol : styles.imageContainerTwoCol,
      ]}
    >
      {/* The listing hands back a signed, single-use URL, so it is stripped back to
          the plain object URL before being cached — the signature changes on every
          load and would otherwise make the same photo a new cache entry each time.
          The download button keeps the signed one, which is what it needs. */}
      <CachedImage
        uri={String(item).split("?")[0]}
        type="event"
        style={styles.image}
        resizeMode="contain"
        onError={() => console.error("Error loading image:", item)}
      />
      <TouchableOpacity
        style={styles.downloadButton}
        onPress={() => downloadImage(item)}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("download")}
      >
        <Ionicons name="download-outline" size={sizes.icon.md} color={colors.onPrimary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <FlatList
      key={`${activeTab}-${numColumns}`}
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={pageForTab.items}
      keyExtractor={(item, index) => (typeof item === "string" ? item : String(item.id ?? index))}
      numColumns={numColumns}
      ListHeaderComponent={tabs}
      renderItem={activeTab === "Photos" ? renderPhoto : renderEvent}
      onEndReached={() => {
        if (!pageForTab.loading && pageForTab.hasMore) loadTab(activeTab, false);
      }}
      onEndReachedThreshold={0.3}
      ListFooterComponent={
        pageForTab.loading ? (
          <ActivityIndicator style={styles.loadingMore} />
        ) : tabErrors[activeTab] && pageForTab.items.length > 0 ? (
          <View style={styles.errorState}>
            <AppText variant="body" color="textSecondary" style={styles.noText}>
              {i18n.t("loadActivityFailed")}
            </AppText>
            <Button
              size="md"
              fullWidth={false}
              title={i18n.t("tryAgain")}
              onPress={() => loadTab(activeTab, false)}
            />
          </View>
        ) : null
      }
      ListEmptyComponent={
        !pageForTab.loading ? (
          tabErrors[activeTab] ? (
            <View style={styles.errorState}>
            <AppText variant="body" color="textSecondary" style={styles.noText}>
              {i18n.t("loadActivityFailed")}
            </AppText>
            <Button
              size="md"
              fullWidth={false}
              title={i18n.t("tryAgain")}
              onPress={() => loadTab(activeTab, true)}
            />
            </View>
          ) : (
            <AppText variant="body" color="textSecondary" style={styles.noText}>
              {activeTab === "Photos" ? i18n.t("noPhotos") : i18n.t("noEvents")}
            </AppText>
          )
        ) : null
      }
    />
  );
}

// Layout only — text, cards and buttons get their look from the ui components.
const PHOTO_MAX_WIDTH = 400;

const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  listContent: {
    paddingBottom: t.spacing["2xl"],
  },

  // Upcoming / Past / Photos switcher
  tabContainer: {
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: t.colors.surfaceMuted,
    borderRadius: t.radius.card,
    padding: t.spacing.xs,
    marginHorizontal: t.spacing.lg,
    marginTop: t.spacing.md,
    marginBottom: t.spacing.md,
  },
  tab: {
    flex: 1,
    minHeight: t.sizes.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: t.radius.control,
  },
  tabActive: {
    backgroundColor: t.colors.primary,
  },

  // Event list — look comes from <Card accent>
  activityCard: {
    marginBottom: t.spacing.md,
    marginHorizontal: t.spacing.lg,
  },

  noText: {
    textAlign: "center",
    marginVertical: t.spacing.lg,
  },
  errorState: {
    alignItems: "center",
    paddingHorizontal: t.spacing.lg,
  },
  loadingMore: {
    marginVertical: t.spacing.base,
  },

  // Photos grid. Width follows the live column count (see numColumns), not the
  // platform, so rotation/resize can move between 2 and 3 columns without overflow.
  imageContainer: {
    aspectRatio: 1,
    marginBottom: t.spacing.base,
    marginHorizontal: "1%",
    position: "relative",
  },
  imageContainerTwoCol: {
    width: "48%",
  },
  imageContainerThreeCol: {
    width: "31%",
    maxWidth: PHOTO_MAX_WIDTH,
  },
  downloadButton: {
    position: "absolute",
    bottom: t.spacing.sm,
    right: t.spacing.sm,
    minWidth: t.sizes.minTouchTarget,
    minHeight: t.sizes.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.overlay,
    borderRadius: t.radius.full,
    borderWidth: 1,
    borderColor: t.colors.overlayBorder,
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: t.radius.card,
    backgroundColor: t.colors.placeholder,
  },
}));
