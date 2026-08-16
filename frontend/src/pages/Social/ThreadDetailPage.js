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
  Text,
  FlatList,
  TextInput,
  Button,
  StyleSheet,
  Platform,
  Alert,
  Image,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useHeaderHeight } from "@react-navigation/elements";
import { KeyboardAvoidingView, KeyboardStickyView } from "react-native-keyboard-controller";
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

const formatDateTime = (isoDate) => {
  const date = new Date(isoDate);
  return date.toLocaleString();
};

const ThreadDetailPage = ({ route }) => {
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
      const repliesPage = await fetchReplies(thread.id, { after: replyCursor, size: 20 });
      const items = Array.isArray(repliesPage?.data) ? repliesPage.data : [];
      // Re-sort after merging: a reply posted locally sits at the end of the list
      // and would otherwise appear before older pages fetched later.
      setReplies((prev) =>
        [
          ...prev,
          ...items.filter((reply) => !prev.some((existing) => existing.id === reply.id)),
        ].sort((a, b) => Number(a.id) - Number(b.id))
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
      setReplies((prev) => [...prev.filter((r) => r.id !== reply.id), reply]);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
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
            accessibilityLabel={i18n.t("removeImage")}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.replyBox}>
        <TextInput
          placeholder={i18n.t("writeReply")}
          value={newReply}
          onChangeText={setNewReply}
          style={styles.input}
        />
        <TouchableOpacity
          onPress={handlePickReplyImage}
          style={styles.replyAttachButton}
          accessibilityLabel={i18n.t("addImage")}
          disabled={postingReply}
        >
          <Ionicons name="image-outline" size={22} color="#007aff" />
        </TouchableOpacity>
        <Button title={i18n.t("reply")} onPress={handleReply} disabled={postingReply} />
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
        contentContainerStyle={{ paddingBottom: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#3b82f6"]}
            tintColor="#3b82f6"
          />
        }
        onEndReached={loadMoreReplies}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          repliesLoading ? <Text style={styles.loadingMore}>{i18n.t("loading")}</Text> : null
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
                  <Text style={styles.reportedPlaceholder}>
                    {i18n.t("reportedPendingReview")}
                  </Text>
                ) : (
                  <Text style={styles.threadTitle}>{thread.title}</Text>
                )}
                <View style={styles.threadMetaRow}>
                  <Text style={styles.threadMeta}>
                    {i18n.t("by")}{" "}
                    {formatName(thread.createdByFirstName, thread.createdByLastName) ||
                      thread.createdByName}{" "}
                    •{" "}
                    {formatDateTime(thread.createdAt)}
                  </Text>
                  <TouchableOpacity
                    onPress={toggleSubscription}
                    style={styles.bellButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={i18n.t(
                      thread.subscribed ? "unfollowTopic" : "followTopic"
                    )}
                  >
                    <Ionicons
                      name={thread.subscribed ? "notifications" : "notifications-off-outline"}
                      size={20}
                      color={thread.subscribed ? "#f59e0b" : "#9ca3af"}
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
                  <Text style={styles.threadContent}>{thread.content}</Text>
                )}

                <View
                  style={{
                    marginTop: 10,
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: 20,
                  }}
                >
                  {!threadShadowHidden && (
                    <>
                      {user?.id === thread.createdById && (
                        <TouchableOpacity
                          onPress={() =>
                            navigation.navigate("EditThread", { thread })
                          }
                        >
                          <Text style={{ color: "#007bff" }}>{i18n.t("edit")}</Text>
                        </TouchableOpacity>
                      )}

                      {(user?.id === thread.createdById || user?.admin) && (
                        <TouchableOpacity onPress={handleDeleteThread}>
                          <Text style={{ color: "#e74c3c" }}>{i18n.t("delete")}</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}

                  {user?.id !== thread.createdById && !thread.reported && (
                    <TouchableOpacity onPress={handleReportThread}>
                      <Text style={{ color: "#e67e22" }}>{i18n.t("report")}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <Text style={styles.repliesHeader}>{i18n.t("replies")}</Text>
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
              <View style={styles.replyItem}>
                <Text style={styles.replyAuthor}>
                  {formatName(item.authorFirstName, item.authorLastName) || item.authorName} • {formatDateTime(item.createdAt)}
                </Text>
                <Text style={styles.reportedPlaceholder}>
                  {i18n.t("reportedPendingReview")}
                </Text>
              </View>
            );
          }
          return (
          <View style={styles.replyItem}>
            <Text style={styles.replyAuthor}>
              {formatName(item.authorFirstName, item.authorLastName) || item.authorName} • {formatDateTime(item.createdAt)}
            </Text>
            {editingReplyId === item.id ? (
              <>
                <TextInput
                  value={editContent}
                  onChangeText={setEditContent}
                  style={styles.editInput}
                  multiline
                />
                <View style={{ flexDirection: "row", marginTop: 6 }}>
                  <Button
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
                  <View style={{ width: 10 }} />
                  <Button
                    title={i18n.t("cancel")}
                    color="gray"
                    onPress={() => setEditingReplyId(null)}
                  />
                </View>
              </>
            ) : (
              <>
                {!!item.content && <Text style={styles.replyText}>{item.content}</Text>}
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
              <View style={{ flexDirection: "row", marginTop: 4 }}>
                {(user?.id === item.authorId || user?.admin) && (
                  <>
                    {user?.id === item.authorId && (
                    <TouchableOpacity
                      onPress={() => {
                        setEditingReplyId(item.id);
                        setEditContent(item.content);
                      }}
                    >
                      <Text style={{ color: "#007bff", marginRight: 16 }}>
                        {i18n.t("edit")}
                      </Text>
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
                    >
                      <Text style={{ color: "#e74c3c", marginRight: 16 }}>
                        {i18n.t("delete")}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {user?.id !== item.authorId && !item.reported && (
                  <TouchableOpacity onPress={() => handleReportReply(item)}>
                    <Text style={{ color: "#e67e22" }}>{i18n.t("report")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          );
        }}
      />

      {Platform.OS === "android" ? (
        <KeyboardStickyView>{replyComposer}</KeyboardStickyView>
      ) : (
        replyComposer
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  threadBox: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    backgroundColor: "#fdfdfd",
  },
  threadTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  threadMeta: {
    fontSize: 13,
    color: "#777",
    marginBottom: 10,
    lineHeight: 21,
  },
  threadContent: {
    fontSize: 16,
    color: "#333",
    lineHeight: 24,
  },

  repliesHeader: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 8,
  },

  replyItem: {
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  replyAuthor: {
    fontWeight: "600",
    marginBottom: 4,
    fontSize: 13,
    color: "#444",
  },
  replyText: {
    fontSize: 15,
    color: "#333",
    lineHeight: 23,
  },
  reportedPlaceholder: {
    fontSize: 15,
    fontStyle: "italic",
    color: "#999",
    lineHeight: 23,
  },
  loadingMore: {
    textAlign: "center",
    color: "#777",
    paddingVertical: 10,
  },

  replyComposer: {
    borderTopWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fafafa",
  },
  replyBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  replyAttachButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  replyPreviewWrap: {
    paddingHorizontal: 12,
    paddingTop: 12,
    alignSelf: "flex-start",
  },
  replyPreview: {
    width: 92,
    height: 92,
    borderRadius: 10,
    backgroundColor: "#eee",
  },
  replyPreviewRemove: {
    position: "absolute",
    top: 6,
    right: -6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    padding: 4,
  },
  threadMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  bellButton: { padding: 2 },
  threadCover: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    marginTop: 12,
    backgroundColor: "#eee",
  },
  replyImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 10,
    marginTop: 8,
    backgroundColor: "#eee",
  },
  input: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  editInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#fff",
    fontSize: 15,
    lineHeight: 23,
  },
});

export default ThreadDetailPage;
