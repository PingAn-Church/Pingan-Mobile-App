import React, { useCallback, useContext, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
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
import { registrationChipFor } from "../../utils/eventDisplay";
import {
  MEDIA_LIBRARY_PERMISSION_DENIED,
  downloadImageToLibrary,
} from "../../utils/mediaLibrary";

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
    return <Text style={styles.noText}>{i18n.t("notVerified")}</Text>;
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
        >
          <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
            {tab === "Upcoming" ? i18n.t("upcoming") : tab === "Past" ? i18n.t("past") : i18n.t("photos")}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderEvent = ({ item }) => {
    const chip = activeTab === "Upcoming" ? registrationChipFor(item) : null;
    return (
    <TouchableOpacity
      style={styles.activityCard}
      onPress={() => navigation.navigate("Events Detail", { eventId: item.id })}
    >
      <View style={styles.activityInfo}>
        <View style={styles.titleRow}>
          <Text style={[styles.activityTitle, styles.titleText]}>{item.title}</Text>
          {chip && (
            <View style={[styles.chip, styles[`chip_${chip.tone}`]]}>
              <Text style={[styles.chipText, styles[`chipText_${chip.tone}`]]}>{chip.label}</Text>
            </View>
          )}
        </View>
        <Text style={styles.activityDetails}>{formatDate(item.date)}</Text>
        <Text style={styles.activityDetails}>{item.startTime + " - " + item.endTime}</Text>
        <Text style={styles.activityDetails}>{item.location}</Text>
      </View>
    </TouchableOpacity>
    );
  };

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
      <TouchableOpacity style={styles.downloadButton} onPress={() => downloadImage(item)}>
        <Ionicons name="download-outline" size={20} color="white" />
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
          <ActivityIndicator style={{ marginVertical: 18 }} />
        ) : tabErrors[activeTab] && pageForTab.items.length > 0 ? (
          <View style={styles.errorState}>
            <Text style={styles.noText}>{i18n.t("loadActivityFailed")}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => loadTab(activeTab, false)}>
              <Text style={styles.retryText}>{i18n.t("tryAgain")}</Text>
            </TouchableOpacity>
          </View>
        ) : null
      }
      ListEmptyComponent={
        !pageForTab.loading ? (
          tabErrors[activeTab] ? (
            <View style={styles.errorState}>
              <Text style={styles.noText}>{i18n.t("loadActivityFailed")}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => loadTab(activeTab, true)}>
                <Text style={styles.retryText}>{i18n.t("tryAgain")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.noText}>
              {activeTab === "Photos" ? i18n.t("noPhotos") : i18n.t("noEvents")}
            </Text>
          )
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  listContent: {
    paddingBottom: 30,
  },
  tabContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
    padding: 5,
    marginHorizontal: 20,
    marginTop: 10,
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
  activityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    marginHorizontal: 20,
    borderLeftWidth: 5,
    borderLeftColor: "#007AFF",
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleText: {
    flexShrink: 1,
  },
  chip: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  chip_open: { backgroundColor: "#E5F0FF" },
  chip_done: { backgroundColor: "#E3F7E8" },
  chip_muted: { backgroundColor: "#EEEEF0" },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  chipText_open: { color: "#0A84FF" },
  chipText_done: { color: "#1F9D44" },
  chipText_muted: { color: "#8E8E93" },
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
  errorState: {
    alignItems: "center",
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: "#007AFF",
    borderRadius: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: {
    color: "white",
    fontWeight: "600",
  },
  // Width follows the live column count (see numColumns), not the platform,
  // so rotation/resize can move between 2 and 3 columns without overflow.
  imageContainer: {
    aspectRatio: 1,
    marginBottom: 15,
    marginHorizontal: "1%",
    position: "relative",
  },
  imageContainerTwoCol: {
    width: "48%",
  },
  imageContainerThreeCol: {
    width: "31%",
    maxWidth: 400,
  },
  downloadButton: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
    backgroundColor: "#eee",
  },
});
