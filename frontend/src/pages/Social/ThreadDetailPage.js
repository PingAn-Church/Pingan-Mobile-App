// // src/pages/Social/ThreadDetailPage.js

// const ThreadDetailPage = ({ route }) => {
//   const { thread } = route.params;

//   // Dummy replies (replace with real fetch later)
// //   const [replies, setReplies] = useState([
// //     { id: 1, content: "Welcome!", author: "User1" },
// //     { id: 2, content: "Glad to be here!", author: "User2" },
// //   ]);

//     const [replies, setReplies] = useState([]);
//     const [newReply, setNewReply] = useState("");

//     useEffect(() => {
//         const loadReplies = async () => {
//           try {
//             const data = await fetchReplies(thread.id);
//             setReplies(data);
//           } catch (error) {
//             showAlert("Error", "Failed to load replies");
//           }
//         };

//         loadReplies();
//       }, [thread.id]);

// //   const handleReply = () => {
// //     if (!newReply.trim()) return;

// //     const newReplyObj = {
// //       id: replies.length + 1,
// //       content: newReply,
// //       author: "CurrentUser", // Replace with actual logged-in user
// //     };

// //     setReplies([...replies, newReplyObj]);
// //     setNewReply("");
// //   };

// const handleReply = async () => {
//     if (!newReply.trim()) return;

//     try {
//       const reply = await postReply(thread.id, { content: newReply });
//       setReplies((prev) => [...prev, reply]);
//       setNewReply("");
//     } catch (error) {
//       showAlert("Error", "Failed to post reply");
//     }
//   };

//   return (
//     <KeyboardAvoidingView
//       style={styles.container}
//       behavior={Platform.select({ ios: "padding", android: undefined })}
//     >
//       <Text style={styles.threadTitle}>{thread.title}</Text>
//       <Text style={styles.threadAuthor}>by {thread.createdByName}</Text>

//       <FlatList
//         data={replies}
//         keyExtractor={(item) => item.id.toString()}
//         contentContainerStyle={{ paddingVertical: 16 }}
//         renderItem={({ item }) => (
//           <View style={styles.replyItem}>
//             <Text style={styles.replyAuthor}>{item.authorName}:</Text>
//             <Text style={styles.replyText}>{item.content}</Text>
//           </View>
//         )}
//       />

// export default ThreadDetailPage;

// src/pages/Social/ThreadDetailPage.js

// // Format ISO date to readable
// const formatDateTime = (isoDate) => {
//   const date = new Date(isoDate);
//   return date.toLocaleString();
// };

// const ThreadDetailPage = ({ route }) => {
//   const { thread } = route.params;

//   const [replies, setReplies] = useState([]);
//   const [newReply, setNewReply] = useState("");

//   const flatListRef = useRef();

//   useEffect(() => {
//     loadReplies();
//   }, [thread.id]);

//   const handleReply = async () => {
//     if (!newReply.trim()) return;

//     try {
//       await postReply(thread.id, { content: newReply });

//       // ✅ Pull the latest replies from the server
//       await loadReplies();

//       setTimeout(() => {
//         flatListRef.current?.scrollToEnd({ animated: true });
//       }, 100); // small delay to ensure replies are rendered

//       // ✅ Clear the input after reloading
//       setNewReply("");
//     } catch (error) {
//       showAlert("Error", "Failed to post reply");
//     }
//   };

//   const loadReplies = async () => {
//   try {
//     const data = await fetchReplies(thread.id);
//     setReplies(data);
//   } catch (error) {
//     showAlert("Error", "Failed to load replies");
//   }
// };

//       <Text style={styles.repliesHeader}>Replies</Text>

//       />

// const formatDateTime = (isoDate) => {
//   const date = new Date(isoDate);
//   return date.toLocaleString();
// };

// const ThreadDetailPage = ({ route }) => {
//   const [thread, setThread] = useState(route.params.thread);
//   const [replies, setReplies] = useState([]);
//   const [newReply, setNewReply] = useState("");
//   const [refreshing, setRefreshing] = useState(false);
//   const flatListRef = useRef();

//   useEffect(() => {
//     loadThreadAndReplies();
//   }, [thread.id]);

//   const handleRefresh = async () => {
//     setRefreshing(true);
//     await loadThreadAndReplies();
//     setRefreshing(false);
//   };

//   const handleReply = async () => {
//     if (!newReply.trim()) return;

//     try {
//       await postReply(thread.id, { content: newReply });
//       await loadThreadAndReplies();

//       setTimeout(() => {
//         flatListRef.current?.scrollToEnd({ animated: true });
//       }, 100);

//       setNewReply("");
//     } catch (error) {
//       showAlert("Error", "Failed to post reply");
//     }
//   };

//       <Text style={styles.repliesHeader}>Replies</Text>

//       />

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: "#fff" },

//   repliesHeader: {
//     fontSize: 20,
//     fontWeight: "600",
//     marginTop: 16,
//     marginHorizontal: 16,
//     marginBottom: 8,
//   },

// export default ThreadDetailPage;

import React, { useEffect, useState, useRef, useContext } from "react";
import {
  View,
  FlatList,
  Platform,
  Image,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useHeaderHeight } from "@react-navigation/elements";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
// Keeps the reply bar above the Android system navigation bar (edge-to-edge).
import StickyInputFooter from "../../components/StickyInputFooter";
import {
  fetchReplies,
  postReply,
  fetchThreadById,
  fetchReplyById,
  updateReply,
  deleteThread,
  deleteReply,
  markThreadSeen,
  setThreadSubscription,
} from "../../service/ThreadService";
import {
  reportContent,
  REPORT_TYPE_THREAD,
  REPORT_TYPE_THREAD_REPLY,
} from "../../service/ReportService";
import { UserContext } from "../../context/UserContext";
import { ChatContext } from "../../context/ChatContext";
import { useNavigation, useRoute } from "@react-navigation/native";
import { confirmAction } from "../../utils/confirmAction";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { LanguageContext } from "../../context/LanguageContext";
import { showAlert } from "../../utils/showAlert";
import { subscribeModerationEvents } from "../../service/ModerationEventService";
import CachedImage from "../../components/CachedImage";
import {
  discardThreadUpload,
  pickThreadImage,
  uploadThreadImage,
} from "../../utils/threadMedia";
import { parseServerDate } from "../../utils/serverDate";
import { makeStyles, useTheme } from "../../theme";
import { AppText, Button, Card, Heading, TextField } from "../../components/ui";

// parseServerDate, not bare new Date(): thread timestamps are zone-less
// LocalDateTime strings in server UTC — a bare parse read them as device-local
// and showed every topic 8 hours early for UTC+8 users.
const formatDateTime = (isoDate) => {
  const date = parseServerDate(isoDate);
  return date ? date.toLocaleString() : "";
};

const ThreadDetailPage = ({ route }) => {
  const styles = useStyles();
  const { colors, sizes } = useTheme();
  const [thread, setThread] = useState(route.params.thread);
  const [replies, setReplies] = useState([]);
  const [newReply, setNewReply] = useState("");
  // The Topics row badge lives in the chat list, so reading a topic here has to
  // tell that list to recount.
  const { refreshTopicUnread } = useContext(ChatContext);
  // Local file until the reply is sent; see utils/threadMedia.
  const [replyImageUri, setReplyImageUri] = useState(null);
  const [postingReply, setPostingReply] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [replyCursor, setReplyCursor] = useState(null);
  const [repliesHasMore, setRepliesHasMore] = useState(true);
  const [repliesLoading, setRepliesLoading] = useState(false);

  const flatListRef = useRef();
  const { language } = useContext(LanguageContext);
  const { user } = useContext(UserContext);
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("threadDetail"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  useEffect(() => {
    if (route.params?.thread) {
      setThread(route.params.thread); // 👈 update thread when coming back
      loadThreadAndReplies(); // 👈 fetch updated replies
    }
  }, [route.params?.thread]);

  useEffect(
    () =>
      subscribeModerationEvents((event) => {
        if (event?.contentType === "THREAD"
            && String(event.contentId) === String(thread.id)) {
          if (event.state === "DELETED") {
            showAlert(i18n.t("threadUnavailable"), i18n.t("moderatedContentDeleted"));
            navigation.goBack();
            return;
          }
          if (event.state === "PENDING") {
            setThread((prev) => {
              const canKeepContent =
                String(prev.createdById) === String(user?.id) || user?.admin;
              return {
                ...prev,
                reported: true,
                title: canKeepContent ? prev.title : null,
                content: canKeepContent ? prev.content : null,
              };
            });
            return;
          }
          if (event.state === "RESTORED") {
            fetchThreadById(thread.id).then(setThread).catch(() => {});
          }
          return;
        }

        if (event?.contentType !== "THREAD_REPLY"
            || String(event.threadId) !== String(thread.id)) {
          return;
        }

        const replyId = String(event.contentId);
        if (event.state === "DELETED") {
          setReplies((prev) =>
            prev.filter((reply) => String(reply.id) !== replyId)
          );
          return;
        }
        if (event.state === "PENDING") {
          setReplies((prev) =>
            prev.map((reply) => {
              if (String(reply.id) !== replyId) return reply;
              const canKeepContent =
                String(reply.authorId) === String(user?.id) || user?.admin;
              return {
                ...reply,
                reported: true,
                content: canKeepContent ? reply.content : null,
              };
            })
          );
          return;
        }
        if (event.state === "RESTORED") {
          fetchReplyById(event.contentId)
            .then((restored) =>
              setReplies((prev) =>
                prev.map((reply) =>
                  String(reply.id) === replyId ? restored : reply
                )
              )
            )
            .catch(() => {});
        }
      }),
    [navigation, thread.id, user?.admin, user?.id]
  );

  const loadThreadAndReplies = async () => {
    try {
      const [updatedThread, repliesPage] = await Promise.all([
        fetchThreadById(thread.id),
        fetchReplies(thread.id, { size: 20 }),
      ]);
      setThread(updatedThread);
      const items = Array.isArray(repliesPage?.data) ? repliesPage.data : [];
      setReplies(items);
      setReplyCursor(repliesPage?.pagination?.nextCursor || null);
      setRepliesHasMore(Boolean(repliesPage?.pagination?.hasMore));
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("loadThreadFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadThreadAndReplies();
    setRefreshing(false);
  };

  const loadMoreReplies = async () => {
    if (repliesLoading || !repliesHasMore) return;
    setRepliesLoading(true);
    try {
      const repliesPage = await fetchReplies(thread.id, { before: replyCursor, size: 20 });
      const items = Array.isArray(repliesPage?.data) ? repliesPage.data : [];
      // Newest first throughout: older pages join the bottom, and re-sorting
      // descending keeps a locally posted reply at the top where it was put.
      setReplies((prev) =>
        [
          ...prev,
          ...items.filter((reply) => !prev.some((existing) => existing.id === reply.id)),
        ].sort((a, b) => Number(b.id) - Number(a.id))
      );
      setReplyCursor(repliesPage?.pagination?.nextCursor || replyCursor);
      setRepliesHasMore(Boolean(repliesPage?.pagination?.hasMore));
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("loadThreadFailed"), [
        { text: i18n.t("ok") },
      ]);
    } finally {
      setRepliesLoading(false);
    }
  };

  /**
   * Opening a topic counts as reading it, so the badge on the Topics row drops
   * on the way in rather than waiting for the reader to do anything. Harmless
   * for topics nobody follows — there is no marker to move.
   */
  useEffect(() => {
    if (!thread?.id) return;
    (async () => {
      await markThreadSeen(thread.id);
      refreshTopicUnread();
    })();
  }, [thread?.id, refreshTopicUnread]);

  const toggleSubscription = async () => {
    const next = !thread.subscribed;
    setThread((current) => ({ ...current, subscribed: next }));
    try {
      const confirmed = await setThreadSubscription(thread.id, next);
      setThread((current) => ({ ...current, subscribed: confirmed }));
    } catch (error) {
      setThread((current) => ({ ...current, subscribed: !next }));
      showAlert(i18n.t("error"), i18n.t("topicFollowFailed"), [{ text: i18n.t("ok") }]);
    }
  };

  const handlePickReplyImage = async () => {
    try {
      const uri = await pickThreadImage();
      if (uri) setReplyImageUri(uri);
    } catch (error) {
      console.error("Failed to pick a reply image:", error);
    }
  };

  const handleReply = async () => {
    // A picture on its own is a perfectly good reply, so either half is enough.
    if (!newReply.trim() && !replyImageUri) return;
    if (postingReply) return;

    setPostingReply(true);
    let uploadedImage = null;
    try {
      // Nothing is uploaded until this moment: a reply typed and then abandoned
      // costs no storage.
      uploadedImage = await uploadThreadImage(replyImageUri);
      const reply = await postReply(thread.id, {
        content: newReply,
        imageUrl: uploadedImage,
      });
      // Straight to the top, where the newest reply belongs.
      setReplies((prev) => [reply, ...prev.filter((r) => r.id !== reply.id)]);

      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);

      setNewReply("");
      setReplyImageUri(null);
    } catch (error) {
      await discardThreadUpload(uploadedImage);
      showAlert(i18n.t("error"), i18n.t("postReplyFailed"), [
        { text: i18n.t("ok") },
      ]);
    } finally {
      setPostingReply(false);
    }
  };

  const handleDeleteThread = async () => {
    const confirmed = await confirmAction({
      title: i18n.t("deleteThread"),
      message: i18n.t("areYouSure"),
      confirmText: i18n.t("delete"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });

    if (!confirmed) return;

    try {
      await deleteThread(thread.id);
      showAlert(i18n.t("success"), i18n.t("deleteThreadSuccess"), [
        { text: i18n.t("ok") },
      ]);
      navigation.goBack(); // or navigation.navigate("ThreadHome");
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("deleteThreadFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  const handleReportThread = async () => {
    const confirmed = await confirmAction({
      title: i18n.t("reportConfirmTitle"),
      message: i18n.t("reportConfirmMessage"),
      confirmText: i18n.t("report"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await reportContent(REPORT_TYPE_THREAD, thread.id);
      // Shadow-hide immediately for the reporter; others pick the flag up on fetch.
      setThread((prev) => ({ ...prev, reported: true }));
      showAlert(i18n.t("success"), i18n.t("reportSuccessMessage"));
    } catch (error) {
      if (error?.response?.status === 409) {
        fetchThreadById(thread.id).then(setThread).catch(() => {});
        showAlert(i18n.t("error"), i18n.t("alreadyReported"));
      } else {
        showAlert(i18n.t("error"), i18n.t("reportFailed"));
      }
    }
  };

  const handleReportReply = async (reply) => {
    const confirmed = await confirmAction({
      title: i18n.t("reportConfirmTitle"),
      message: i18n.t("reportConfirmMessage"),
      confirmText: i18n.t("report"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });
    if (!confirmed) return;

    const markReported = () =>
      setReplies((prev) =>
        prev.map((r) => (r.id === reply.id ? { ...r, reported: true } : r))
      );

    try {
      await reportContent(REPORT_TYPE_THREAD_REPLY, reply.id);
      markReported();
      showAlert(i18n.t("success"), i18n.t("reportSuccessMessage"));
    } catch (error) {
      if (error?.response?.status === 409) {
        fetchReplyById(reply.id)
          .then((serverReply) =>
            setReplies((prev) =>
              prev.map((item) => item.id === reply.id ? serverReply : item)
            )
          )
          .catch(() => {});
        showAlert(i18n.t("error"), i18n.t("alreadyReported"));
      } else {
        showAlert(i18n.t("error"), i18n.t("reportFailed"));
      }
    }
  };

  const replyComposer = (
    <View style={styles.replyComposer}>
      {/* The picked picture previews above the field, where it does not squeeze
          the text input, and stays a local file until the reply is sent. */}
      {replyImageUri ? (
        <View style={styles.replyPreviewWrap}>
          <Image source={{ uri: replyImageUri }} style={styles.replyPreview} />
          <TouchableOpacity
            style={styles.replyPreviewRemove}
            onPress={() => setReplyImageUri(null)}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("removeImage")}
          >
            <Ionicons name="close" size={sizes.icon.xs} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.replyBox}>
        <TextField
          size="sm"
          placeholder={i18n.t("writeReply")}
          value={newReply}
          onChangeText={setNewReply}
          style={styles.input}
        />
        <TouchableOpacity
          onPress={handlePickReplyImage}
          style={styles.replyAttachButton}
          accessibilityRole="button"
          accessibilityLabel={i18n.t("addImage")}
          disabled={postingReply}
        >
          <Ionicons name="image-outline" size={sizes.icon.lg} color={colors.primary} />
        </TouchableOpacity>
        <Button
          size="sm"
          fullWidth={false}
          title={i18n.t("reply")}
          onPress={handleReply}
          disabled={postingReply}
          style={styles.slimButton}
        />
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
    >
      <FlatList
        ref={flatListRef}
        data={replies}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        onEndReached={loadMoreReplies}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          repliesLoading ? (
            <AppText variant="secondary" style={styles.loadingMore}>
              {i18n.t("loading")}
            </AppText>
          ) : null
        }
        ListHeaderComponent={(() => {
          // Reported threads are shadow-hidden from everyone except their author
          // until an admin resolves the report.
          const threadShadowHidden =
            !!thread.reported && user?.id !== thread.createdById;
          return (
            <View>
              <View style={styles.threadBox}>
                {threadShadowHidden ? (
                  <AppText
                    variant="body"
                    color="textSecondary"
                    style={styles.reportedPlaceholder}
                  >
                    {i18n.t("reportedPendingReview")}
                  </AppText>
                ) : (
                  <Heading level={1} style={styles.threadTitle}>
                    {thread.title}
                  </Heading>
                )}
                <View style={styles.threadMetaRow}>
                  <AppText variant="secondary" style={styles.threadMeta}>
                    {i18n.t("by")}{" "}
                    {formatName(thread.createdByFirstName, thread.createdByLastName) ||
                      thread.createdByName}{" "}
                    •{" "}
                    {formatDateTime(thread.createdAt)}
                  </AppText>
                  <TouchableOpacity
                    onPress={toggleSubscription}
                    style={styles.bellButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={i18n.t(
                      thread.subscribed ? "unfollowTopic" : "followTopic"
                    )}
                  >
                    <Ionicons
                      name={thread.subscribed ? "notifications" : "notifications-off-outline"}
                      size={sizes.icon.md}
                      color={
                        thread.subscribed
                          ? colors.thread.following
                          : colors.thread.notFollowing
                      }
                    />
                  </TouchableOpacity>
                </View>

                {!threadShadowHidden && !!thread.coverImage && (
                  <CachedImage
                    uri={thread.coverImage}
                    type="thread"
                    style={styles.threadCover}
                    resizeMode="cover"
                  />
                )}

                {!threadShadowHidden && (
                  <AppText variant="body">{thread.content}</AppText>
                )}

                <View style={styles.threadActions}>
                  {!threadShadowHidden && (
                    <>
                      {user?.id === thread.createdById && (
                        <TouchableOpacity
                          onPress={() =>
                            navigation.navigate("EditThread", { thread })
                          }
                          accessibilityRole="button"
                        >
                          <AppText variant="link" size="sm" weight="regular">
                            {i18n.t("edit")}
                          </AppText>
                        </TouchableOpacity>
                      )}

                      {(user?.id === thread.createdById || user?.admin) && (
                        <TouchableOpacity
                          onPress={handleDeleteThread}
                          accessibilityRole="button"
                        >
                          <AppText variant="link" size="sm" weight="regular" color="danger">
                            {i18n.t("delete")}
                          </AppText>
                        </TouchableOpacity>
                      )}
                    </>
                  )}

                  {user?.id !== thread.createdById && !thread.reported && (
                    <TouchableOpacity
                      onPress={handleReportThread}
                      accessibilityRole="button"
                    >
                      <AppText variant="link" size="sm" weight="regular" color="danger">
                        {i18n.t("report")}
                      </AppText>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <Heading level={2} weight="semibold" style={styles.repliesHeader}>
                {i18n.t("replies")}
              </Heading>
            </View>
          );
        })()}
        renderItem={({ item }) => {
          // Authors and admins retain the original text while moderation is pending.
          const replyShadowHidden =
            !!item.reported
            && String(user?.id) !== String(item.authorId)
            && !user?.admin;
          if (replyShadowHidden) {
            return (
              <Card variant="subtle" style={styles.replyItem}>
                <AppText
                  variant="secondary"
                  weight="semibold"
                  style={styles.replyAuthor}
                >
                  {formatName(item.authorFirstName, item.authorLastName) || item.authorName} • {formatDateTime(item.createdAt)}
                </AppText>
                <AppText
                  variant="body"
                  color="textSecondary"
                  style={styles.reportedPlaceholder}
                >
                  {i18n.t("reportedPendingReview")}
                </AppText>
              </Card>
            );
          }
          return (
          <Card variant="subtle" style={styles.replyItem}>
            <AppText
              variant="secondary"
              weight="semibold"
              style={styles.replyAuthor}
            >
              {formatName(item.authorFirstName, item.authorLastName) || item.authorName} • {formatDateTime(item.createdAt)}
            </AppText>
            {editingReplyId === item.id ? (
              <>
                <TextField
                  value={editContent}
                  onChangeText={setEditContent}
                  style={styles.editInput}
                  multiline
                />
                <View style={styles.editActions}>
                  <Button
                    size="sm"
                    fullWidth={false}
                    style={styles.slimButton}
                    title={i18n.t("save")}
                    onPress={async () => {
                      try {
                        await updateReply(item.id, editContent);
                        setReplies((prev) =>
                          prev.map((reply) =>
                            reply.id === item.id ? { ...reply, content: editContent } : reply
                          )
                        );
                        setEditingReplyId(null);
                        setEditContent("");
                      } catch (err) {
                        showAlert(
                          i18n.t("error"),
                          err?.response?.status === 409
                            ? i18n.t("contentUnderReview")
                            : i18n.t("updateReplyFailed"),
                          [{ text: i18n.t("ok") }]
                        );
                      }
                    }}
                  />
                  <View style={styles.buttonSpacer} />
                  <Button
                    variant="neutral"
                    size="sm"
                    fullWidth={false}
                    title={i18n.t("cancel")}
                    onPress={() => setEditingReplyId(null)}
                    style={styles.slimButton}
                  />
                </View>
              </>
            ) : (
              <>
                {!!item.content && (
                  <AppText variant="body">
                    {item.content}
                  </AppText>
                )}
                {!!item.imageUrl && (
                  <CachedImage
                    uri={item.imageUrl}
                    type="thread"
                    style={styles.replyImage}
                    resizeMode="cover"
                  />
                )}
              </>
            )}
            {(user?.id === item.authorId || user?.admin || !item.reported) && (
              <View style={styles.replyActions}>
                {(user?.id === item.authorId || user?.admin) && (
                  <>
                    {user?.id === item.authorId && (
                    <TouchableOpacity
                      onPress={() => {
                        setEditingReplyId(item.id);
                        setEditContent(item.content);
                      }}
                      accessibilityRole="button"
                    >
                      <AppText
                        variant="link"
                        size="sm"
                        weight="regular"
                        style={styles.replyActionText}
                      >
                        {i18n.t("edit")}
                      </AppText>
                    </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      onPress={async () => {
                        const confirmed = await confirmAction({
                          title: i18n.t("deleteReply"),
                          message: i18n.t("areYouSure"),
                          confirmText: i18n.t("delete"),
                          cancelText: i18n.t("cancel"),
                          destructive: true,
                        });

                        if (!confirmed) return;

                        try {
                          await deleteReply(item.id);
                          setReplies((prev) => prev.filter((reply) => reply.id !== item.id));
                        } catch (err) {
                          showAlert(i18n.t("error"), i18n.t("deleteReplyFailed"), [
                            { text: i18n.t("ok") },
                          ]);
                        }
                      }}
                      accessibilityRole="button"
                    >
                      <AppText
                        variant="link"
                        size="sm"
                        weight="regular"
                        color="danger"
                        style={styles.replyActionText}
                      >
                        {i18n.t("delete")}
                      </AppText>
                    </TouchableOpacity>
                  </>
                )}

                {user?.id !== item.authorId && !item.reported && (
                  <TouchableOpacity
                    onPress={() => handleReportReply(item)}
                    accessibilityRole="button"
                  >
                    <AppText variant="link" size="sm" weight="regular" color="danger">
                      {i18n.t("report")}
                    </AppText>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </Card>
          );
        }}
      />

      <StickyInputFooter background={colors.surfaceSubtle}>{replyComposer}</StickyInputFooter>
    </KeyboardAvoidingView>
  );
};

export default ThreadDetailPage;

// Layout only — text, inputs, cards and buttons get their look from the ui components.
const PREVIEW_SIZE = 92; 

const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  listContent: {
    paddingBottom: t.spacing.base,
  },
  threadBox: {
    padding: t.spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
    backgroundColor: t.colors.background,
  },
  threadTitle: {
    marginBottom: t.spacing.xs,
  },
  threadMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: t.spacing.md,
  },
  threadMeta: {
    marginBottom: t.spacing.md,
  },
  bellButton: {
    padding: t.spacing.xs,
  },
  threadCover: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: t.radius.card,
    marginTop: t.spacing.md,
    backgroundColor: t.colors.placeholder,
  },
  threadActions: {
    marginTop: t.spacing.md, 
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: t.spacing.lg,
  },
  repliesHeader: {
    marginTop: t.spacing.base,
    marginHorizontal: t.spacing.base,
    marginBottom: t.spacing.sm,
  },
  replyItem: {
    padding: t.spacing.md,
    marginHorizontal: t.spacing.base,
    marginBottom: t.spacing.md,
  },
  replyAuthor: {
    marginBottom: t.spacing.xs,
  },
  reportedPlaceholder: {
    fontStyle: "italic",
  },
  replyImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: t.radius.card,
    marginTop: t.spacing.sm,
    backgroundColor: t.colors.placeholder,
  },
  editInput: {
    padding: t.spacing.sm,
    borderRadius: t.radius.control,
    backgroundColor: t.colors.surface,
    lineHeight: t.textVariants.body.lineHeight,
  },
  editActions: {
    flexDirection: "row",
    marginTop: t.spacing.sm,
  },
  buttonSpacer: {
    width: t.spacing.md, 
  },
  replyActions: {
    flexDirection: "row",
    marginTop: t.spacing.xs,
  },
  replyActionText: {
    marginRight: t.spacing.base,
  },
  loadingMore: {
    textAlign: "center",
    paddingVertical: t.spacing.md,
  },
  replyComposer: {
    borderTopWidth: 1,
    borderColor: t.colors.borderSubtle,
    backgroundColor: t.colors.surfaceSubtle,
  },
  replyBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: t.spacing.md,
  },
  input: {
    flex: 1,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.control,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    marginRight: t.spacing.sm,
  },
  replyAttachButton: {
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.sm,
  },
  replyPreviewWrap: {
    paddingHorizontal: t.spacing.md,
    paddingTop: t.spacing.md,
    alignSelf: "flex-start",
  },
  replyPreview: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.placeholder,
  },
  replyPreviewRemove: {
    position: "absolute",
    top: t.spacing.sm,
    right: -t.spacing.sm,
    backgroundColor: t.colors.overlay,
    borderRadius: t.radius.full,
    padding: t.spacing.xs,
  },
  slimButton: {
    minHeight: 0,
    paddingVertical: t.spacing.sm,
  },
}));
