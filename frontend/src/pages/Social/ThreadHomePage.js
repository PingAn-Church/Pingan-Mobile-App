import { showAlert } from "../../utils/showAlert";
// // src/pages/Social/ThreadHomePage.js

// // Dummy data (replace this with API call later)
// // const mockThreads = [
// //   { id: 1, title: "Welcome to the community!", createdBy: "Admin" },
// //   { id: 2, title: "Introduce Yourself", createdBy: "JaneDoe" },
// //   { id: 3, title: "Weekly Updates", createdBy: "Moderator" },
// // ];

// const formatDateTime = (isoDate) => {
//   const date = new Date(isoDate);
//   return date.toLocaleString(); // You can use .toLocaleDateString() if you want only date
// };

// const ThreadHomePage = () => {
//   const navigation = useNavigation();
//   const [threads, setThreads] = useState([]);
//   const [loading, setLoading] = useState(true);

//   // useEffect(() => {
//   //   // Simulate fetching threads from backend
//   //   setTimeout(() => {
//   //     setThreads(mockThreads);
//   //     setLoading(false);
//   //   }, 1000);
//   // }, []);

//   useEffect(() => {
//     const loadThreads = async () => {
//       try {
//         const data = await fetchThreads();
//         setThreads(data);
//       } catch (error) {
//         showAlert("Error", "Failed to load threads");
//       } finally {
//         setLoading(false);
//       }
//     };

//     loadThreads();
//   }, []);

//   const handleThreadPress = (thread) => {
//     // Navigate to detailed thread page (to be created)
//     navigation.navigate("ThreadDetail", { thread });
//   };

//   const handleCreateThread = () => {
//     // Navigate to create thread page (to be created)
//     navigation.navigate("CreateThread");
//   };

//   if (loading) return <ActivityIndicator size="large" color="blue" />;

// export default ThreadHomePage;

// src/pages/Social/ThreadHomePage.js
import React, { useState, useEffect, useCallback, useContext } from "react";
import {
  View,
  Text,
  FlatList,
  Button,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { fetchThreadById, fetchThreads } from "../../service/ThreadService";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { LanguageContext } from "../../context/LanguageContext";
import { UserContext } from "../../context/UserContext";
import { subscribeModerationEvents } from "../../service/ModerationEventService";
import CroppedCoverImage from "../../components/CroppedCoverImage";
import { Ionicons } from "@expo/vector-icons";
import { setThreadSubscription } from "../../service/ThreadService";
import { parseServerDate } from "../../utils/serverDate";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { stripInlineMarkup } from "../../utils/inlineMarkup";

// List rows open with the start of the post as plain text: markers off, then cut.
const previewOf = (content) => {
  const plain = stripInlineMarkup(content);
  return plain.length > 80 ? plain.slice(0, 80) + "..." : plain;
};

// Helper to format a server timestamp to a readable local time. parseServerDate
// applies the server-UTC rule (zone-less LocalDateTime strings would otherwise
// be read as device-local and display 8 hours early for UTC+8 users).
const formatDateTime = (isoDate) => {
  const date = parseServerDate(isoDate);
  return date ? date.toLocaleString() : "";
};

const ThreadHomePage = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [threads, setThreads] = useState([]);
  // const [loading, setLoading] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { language } = useContext(LanguageContext);
  const { user } = useContext(UserContext);

  // useEffect(() => {
  //   const loadThreads = async () => {
  //     try {
  //       const data = await fetchThreads();
  //       setThreads(data);
  //     } catch (error) {
  //       showAlert("Error", "Failed to load threads");
  //     } finally {
  //       setLoading(false);
  //     }
  //   };

  //   loadThreads();
  // }, []);

  function handleThreadPress(thread) {
    navigation.navigate("ThreadDetail", { thread });
  }

  const handleCreateThread = () => {
    navigation.navigate("CreateThread");
  };

  //     loadThreads();
  //   }, [])
  // );

  // const loadThreads = async () => {
  //   try {
  //     setLoading(true); // <--- also show loading indicator
  //     const data = await fetchThreads();
  //     setThreads(data);
  //   } catch (error) {
  //     showAlert("Error", "Failed to load threads");
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const loadThreads = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoadingInitial(true);
    }

    try {
      const res = await fetchThreads(0, 20);
      setThreads(res?.data || []);
      setPage(0);
      setHasMore(Boolean(res?.pagination?.hasMore));
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("loadThreadFailed"), [
        { text: i18n.t("ok") },
      ]);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoadingInitial(false);
      }
    }
  };

  /**
   * Turns the bell on or off for one topic. The row flips immediately and is put
   * back if the server disagrees, so a tap never feels like it did nothing.
   */
  const toggleSubscription = async (thread) => {
    const next = !thread.subscribed;
    setThreads((prev) =>
      prev.map((t) => (t.id === thread.id ? { ...t, subscribed: next } : t))
    );
    try {
      const confirmed = await setThreadSubscription(thread.id, next);
      setThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, subscribed: confirmed } : t))
      );
    } catch (error) {
      setThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, subscribed: !next } : t))
      );
      showAlert(i18n.t("error"), i18n.t("topicFollowFailed"), [{ text: i18n.t("ok") }]);
    }
  };

  const loadMoreThreads = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await fetchThreads(next, 20);
      setThreads((prev) => [...prev, ...(res?.data || [])]);
      setPage(next);
      setHasMore(Boolean(res?.pagination?.hasMore));
    } catch (error) {
      // Keep what we have; the next scroll can retry.
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("threadsAndTopics"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  useFocusEffect(
    useCallback(() => {
      loadThreads();
    }, [])
  );

  useEffect(
    () =>
      subscribeModerationEvents((event) => {
        if (event?.contentType !== "THREAD") return;
        const threadId = String(event.contentId);

        if (event.state === "DELETED") {
          setThreads((prev) => prev.filter((thread) => String(thread.id) !== threadId));
          return;
        }

        if (event.state === "PENDING") {
          setThreads((prev) =>
            prev.map((thread) => {
              if (String(thread.id) !== threadId) return thread;
              const canKeepContent =
                String(thread.createdById) === String(user?.id) || user?.admin;
              return {
                ...thread,
                reported: true,
                title: canKeepContent ? thread.title : null,
                content: canKeepContent ? thread.content : null,
              };
            })
          );
          return;
        }

        if (event.state === "RESTORED") {
          fetchThreadById(event.contentId)
            .then((restored) =>
              setThreads((prev) =>
                prev.map((thread) =>
                  String(thread.id) === threadId ? restored : thread
                )
              )
            )
            .catch(() => {});
        }
      }),
    [user?.admin, user?.id]
  );

  if (loadingInitial) return <ActivityIndicator size="large" color="blue" />;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{i18n.t("threadsAndTopics")}</Text>

      {/* <FlatList
        data={threads}
        keyExtractor={(item) => item.id.toString()}
        refreshing={refreshing}
        onRefresh={() => loadThreads(true)} // smoother pull-to-refresh
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.threadItem}
            onPress={() => handleThreadPress(item)}
          >
            <Text style={styles.threadTitle}>{item.title}</Text>
            <Text style={styles.threadContent}>
              {previewOf(item.content)}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.threadMeta}>
                by {formatName(item.createdByFirstName, item.createdByLastName) || item.createdByName}
              </Text>
              <Text style={styles.threadMeta}>{formatDateTime(item.createdAt)}</Text>
            </View>
          </TouchableOpacity>
        )}
      /> */}
      {threads.length === 0 ? (
        <Text
          style={{ textAlign: "center", marginVertical: 40, color: "#888" }}
        >
          {i18n.t("noThreads")}
        </Text>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id.toString()}
          refreshing={refreshing}
          onRefresh={() => loadThreads(true)}
          onEndReached={loadMoreThreads}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color="blue" style={{ marginVertical: 16 }} />
            ) : null
          }
          renderItem={({ item }) => {
            // Reported threads are shadow-hidden from everyone except their author
            // until an admin resolves the report.
            const shadowHidden = !!item.reported && user?.id !== item.createdById;
            return (
              <TouchableOpacity
                style={styles.threadItem}
                onPress={() => handleThreadPress(item)}
              >
                {shadowHidden ? (
                  <Text style={styles.reportedPlaceholder}>
                    {i18n.t("reportedPendingReview")}
                  </Text>
                ) : (
                  <>
                    {!!item.coverImage && (
                      <CroppedCoverImage
                        uri={item.coverImage}
                        type="thread"
                        style={styles.threadCover}
                      />
                    )}
                    <Text style={styles.threadTitle}>{item.title}</Text>
                    <Text style={styles.threadContent}>
                      {previewOf(item.content)}
                    </Text>
                  </>
                )}
                <View style={styles.metaRow}>
                  <Text style={styles.threadMeta}>
                    {i18n.t("by")} {formatName(item.createdByFirstName, item.createdByLastName) || item.createdByName}
                  </Text>
                  <View style={styles.metaRight}>
                    <Text style={styles.threadMeta}>
                      {formatDateTime(item.createdAt)}
                    </Text>
                    {/* Topics are silent unless you ask for them; this is the ask. */}
                    <TouchableOpacity
                      onPress={() => toggleSubscription(item)}
                      style={styles.bellButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={i18n.t(
                        item.subscribed ? "unfollowTopic" : "followTopic"
                      )}
                    >
                      <Ionicons
                        name={item.subscribed ? "notifications" : "notifications-off-outline"}
                        size={19}
                        color={item.subscribed ? "#f59e0b" : "#9ca3af"}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Lifted above the system navigation bar — edge-to-edge draws the page
          behind it, and a bottom-flush button was partly covered by 3-button nav. */}
      <View style={{ paddingBottom: insets.bottom }}>
        <Button
          title={i18n.t("createNewThread")}
          onPress={handleCreateThread}
          disabled={loadingInitial || refreshing}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  header: { fontSize: 26, fontWeight: "bold", marginBottom: 20 },
  threadItem: {
    padding: 16,
    backgroundColor: "#ffffff",
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  metaRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  bellButton: { padding: 2 },
  threadCover: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: "#eee",
  },
  threadTitle: { fontSize: 18, fontWeight: "600", marginBottom: 6 },
  threadContent: {
    fontSize: 15,
    color: "#333",
    marginBottom: 8,
    lineHeight: 23,
  },
  reportedPlaceholder: {
    fontSize: 15,
    fontStyle: "italic",
    color: "#999",
    marginBottom: 8,
    lineHeight: 23,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  threadMeta: {
    fontSize: 13,
    color: "#777",
    lineHeight: 21,
  },
});

export default ThreadHomePage;
