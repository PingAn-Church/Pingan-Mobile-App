// // src/pages/Social/ThreadDetailPage.js
// import React, { useState } from "react";
// import {
//   View,
//   Text,
//   FlatList,
//   TextInput,
//   Button,
//   StyleSheet,
//   KeyboardAvoidingView,
//   Platform,
// } from "react-native";
// import { useEffect } from "react";
// import { fetchReplies, postReply } from "../../service/ThreadService";
// import { Alert } from "react-native";

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
//             Alert.alert("Error", "Failed to load replies");
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
//       Alert.alert("Error", "Failed to post reply");
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

//       <View style={styles.replyBox}>
//         <TextInput
//           placeholder="Write a reply..."
//           value={newReply}
//           onChangeText={setNewReply}
//           style={styles.input}
//         />
//         <Button title="Reply" onPress={handleReply} />
//       </View>
//     </KeyboardAvoidingView>
//   );
// };

// const styles = StyleSheet.create({
//     container: { flex: 1, backgroundColor: "#fff" },
//     threadTitle: {
//       fontSize: 24,
//       fontWeight: "bold",
//       marginBottom: 4,
//       marginTop: 16,
//       marginHorizontal: 16,
//     },
//     threadAuthor: {
//       fontSize: 14,
//       color: "gray",
//       marginBottom: 16,
//       marginHorizontal: 16,
//     },
//     replyItem: {
//       backgroundColor: "#f9f9f9",
//       borderRadius: 10,
//       padding: 12,
//       marginHorizontal: 16,
//       marginBottom: 10,
//       borderWidth: 1,
//       borderColor: "#e5e5e5",
//     },
//     replyAuthor: { fontWeight: "600", marginBottom: 4, fontSize: 14 },
//     replyText: { fontSize: 16, color: "#333" },
//     replyBox: {
//       flexDirection: "row",
//       alignItems: "center",
//       padding: 12,
//       borderTopWidth: 1,
//       borderColor: "#ddd",
//       backgroundColor: "#fafafa",
//     },
//     input: {
//       flex: 1,
//       backgroundColor: "#fff",
//       borderWidth: 1,
//       borderColor: "#ccc",
//       borderRadius: 8,
//       paddingHorizontal: 12,
//       paddingVertical: 8,
//       marginRight: 8,
//     },
// });

// export default ThreadDetailPage;

// src/pages/Social/ThreadDetailPage.js
// import React, { useEffect, useState, useRef } from "react";
// import {
//   View,
//   Text,
//   FlatList,
//   TextInput,
//   Button,
//   StyleSheet,
//   KeyboardAvoidingView,
//   Platform,
//   Alert,
// } from "react-native";
// import { fetchReplies, postReply } from "../../service/ThreadService";

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
//       Alert.alert("Error", "Failed to post reply");
//     }
//   };

//   const loadReplies = async () => {
//   try {
//     const data = await fetchReplies(thread.id);
//     setReplies(data);
//   } catch (error) {
//     Alert.alert("Error", "Failed to load replies");
//   }
// };

//   return (
//     <KeyboardAvoidingView
//       style={styles.container}
//       behavior={Platform.select({ ios: "padding", android: undefined })}
//     >
//       <View style={styles.threadBox}>
//         <Text style={styles.threadTitle}>{thread.title}</Text>
//         <Text style={styles.threadMeta}>
//           by {thread.createdByName} • {formatDateTime(thread.createdAt)}
//         </Text>
//         <Text style={styles.threadContent}>{thread.content}</Text>
//       </View>

//       <Text style={styles.repliesHeader}>Replies</Text>

//       <FlatList
//         ref={flatListRef}
//         data={replies}
//         keyExtractor={(item) => item.id.toString()}
//         contentContainerStyle={{ paddingBottom: 16 }}
//         renderItem={({ item }) => (
//           <View style={styles.replyItem}>
//             <Text style={styles.replyAuthor}>
//               {item.authorName} • {formatDateTime(item.createdAt)}
//             </Text>
//             <Text style={styles.replyText}>{item.content}</Text>
//           </View>
//         )}
//       />

//       <View style={styles.replyBox}>
//         <TextInput
//           placeholder="Write a reply..."
//           value={newReply}
//           onChangeText={setNewReply}
//           style={styles.input}
//         />
//         <Button title="Reply" onPress={handleReply} />
//       </View>
//     </KeyboardAvoidingView>
//   );
// };

// import React, { useEffect, useState, useRef } from "react";
// import {
//   View,
//   Text,
//   FlatList,
//   TextInput,
//   Button,
//   StyleSheet,
//   KeyboardAvoidingView,
//   Platform,
//   Alert,
//   RefreshControl,
// } from "react-native";
// import {
//   fetchReplies,
//   postReply,
//   fetchThreadById,
// } from "../../service/ThreadService";

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

//   const loadThreadAndReplies = async () => {
//     try {
//       const [updatedThread, fetchedReplies] = await Promise.all([
//         fetchThreadById(thread.id),
//         fetchReplies(thread.id),
//       ]);
//       setThread(updatedThread);
//       setReplies(fetchedReplies);
//     } catch (error) {
//       Alert.alert("Error", "Failed to load thread or replies");
//     }
//   };

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
//       Alert.alert("Error", "Failed to post reply");
//     }
//   };

//   return (
//     <KeyboardAvoidingView
//       style={styles.container}
//       behavior={Platform.select({ ios: "padding", android: undefined })}
//     >
//       <View style={styles.threadBox}>
//         <Text style={styles.threadTitle}>{thread.title}</Text>
//         <Text style={styles.threadMeta}>
//           by {thread.createdByName} • {formatDateTime(thread.createdAt)}
//         </Text>
//         <Text style={styles.threadContent}>{thread.content}</Text>
//       </View>

//       <Text style={styles.repliesHeader}>Replies</Text>

//       <FlatList
//         ref={flatListRef}
//         data={replies}
//         keyExtractor={(item) => item.id.toString()}
//         contentContainerStyle={{ paddingBottom: 16 }}
//         refreshControl={
//           <RefreshControl
//             refreshing={refreshing}
//             onRefresh={handleRefresh}
//             colors={["#3b82f6"]}
//             tintColor="#3b82f6"
//           />
//         }
//         renderItem={({ item }) => (
//           <View style={styles.replyItem}>
//             <Text style={styles.replyAuthor}>
//               {item.authorName} • {formatDateTime(item.createdAt)}
//             </Text>
//             <Text style={styles.replyText}>{item.content}</Text>
//           </View>
//         )}
//       />

//       <View style={styles.replyBox}>
//         <TextInput
//           placeholder="Write a reply..."
//           value={newReply}
//           onChangeText={setNewReply}
//           style={styles.input}
//         />
//         <Button title="Reply" onPress={handleReply} />
//       </View>
//     </KeyboardAvoidingView>
//   );
// };

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: "#fff" },

//   threadBox: {
//     padding: 16,
//     borderBottomWidth: 1,
//     borderBottomColor: "#eee",
//     backgroundColor: "#fdfdfd",
//   },
//   threadTitle: {
//     fontSize: 24,
//     fontWeight: "bold",
//     marginBottom: 4,
//   },
//   threadMeta: {
//     fontSize: 13,
//     color: "#777",
//     marginBottom: 10,
//   },
//   threadContent: {
//     fontSize: 16,
//     color: "#333",
//   },

//   repliesHeader: {
//     fontSize: 20,
//     fontWeight: "600",
//     marginTop: 16,
//     marginHorizontal: 16,
//     marginBottom: 8,
//   },

//   replyItem: {
//     backgroundColor: "#f9f9f9",
//     borderRadius: 10,
//     padding: 12,
//     marginHorizontal: 16,
//     marginBottom: 10,
//     borderWidth: 1,
//     borderColor: "#e5e5e5",
//   },
//   replyAuthor: {
//     fontWeight: "600",
//     marginBottom: 4,
//     fontSize: 13,
//     color: "#444",
//   },
//   replyText: {
//     fontSize: 15,
//     color: "#333",
//   },

//   replyBox: {
//     flexDirection: "row",
//     alignItems: "center",
//     padding: 12,
//     borderTopWidth: 1,
//     borderColor: "#ddd",
//     backgroundColor: "#fafafa",
//   },
//   input: {
//     flex: 1,
//     backgroundColor: "#fff",
//     borderWidth: 1,
//     borderColor: "#ccc",
//     borderRadius: 8,
//     paddingHorizontal: 12,
//     paddingVertical: 8,
//     marginRight: 8,
//   },
// });

// export default ThreadDetailPage;

import React, { useEffect, useState, useRef, useContext } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Button,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import {
  fetchReplies,
  postReply,
  fetchThreadById,
  updateReply,
  deleteThread,
  deleteReply,
} from "../../service/ThreadService";
import { UserContext } from "../../context/UserContext";
import { useNavigation, useRoute } from "@react-navigation/native";
import { confirmAction } from "../../utils/confirmAction";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { showAlert } from "../../utils/showAlert";


const formatDateTime = (isoDate) => {
  const date = new Date(isoDate);
  return date.toLocaleString();
};

const ThreadDetailPage = ({ route }) => {
  const [thread, setThread] = useState(route.params.thread);
  const [replies, setReplies] = useState([]);
  const [newReply, setNewReply] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState(null);
  const [editContent, setEditContent] = useState("");

  const flatListRef = useRef();
  const { language } = useContext(LanguageContext);
  const { user } = useContext(UserContext);
  const navigation = useNavigation();

  console.log("TESTINTG")
  console.log("USER", user);

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

  const loadThreadAndReplies = async () => {
    try {
      const [updatedThread, fetchedReplies] = await Promise.all([
        fetchThreadById(thread.id),
        fetchReplies(thread.id),
      ]);
      setThread(updatedThread);
      setReplies(fetchedReplies);
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

  const handleReply = async () => {
    if (!newReply.trim()) return;

    try {
      await postReply(thread.id, { content: newReply });
      await loadThreadAndReplies();

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

      setNewReply("");
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("postReplyFailed"), [
        { text: i18n.t("ok") },
      ]);
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: "padding", android: undefined })}
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
        ListHeaderComponent={
          <View>
            <View style={styles.threadBox}>
              <Text style={styles.threadTitle}>{thread.title}</Text>
              <Text style={styles.threadMeta}>
                {i18n.t("by")} {thread.createdByName} •{" "}
                {formatDateTime(thread.createdAt)}
              </Text>

              <Text style={styles.threadContent}>{thread.content}</Text>

              {(user?.id === thread.createdById || user?.admin) && (
                <View
                  style={{
                    marginTop: 10,
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: 20,
                  }}
                >
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate("EditThread", { thread })
                    }
                  >
                    <Text style={{ color: "#007bff" }}>{i18n.t("edit")}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={handleDeleteThread}>
                    <Text style={{ color: "#e74c3c" }}>{i18n.t("delete")}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <Text style={styles.repliesHeader}>{i18n.t("replies")}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.replyItem}>
            <Text style={styles.replyAuthor}>
              {item.authorName} • {formatDateTime(item.createdAt)}
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
                        setEditingReplyId(null);
                        setEditContent("");
                        await loadThreadAndReplies();
                      } catch (err) {
                        showAlert(
                          i18n.t("error"),
                          i18n.t("updateReplyFailed"),
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
              <Text style={styles.replyText}>{item.content}</Text>
            )}
            {(user?.id === item.authorId || user?.admin) && (
              <View style={{ flexDirection: "row", marginTop: 4 }}>
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
                      await loadThreadAndReplies();
                    } catch (err) {
                      showAlert(i18n.t("error"), i18n.t("deleteReplyFailed"), [
                        { text: i18n.t("ok") },
                      ]);
                    }
                  }}
                >
                  <Text style={{ color: "#e74c3c" }}>{i18n.t("delete")}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />

      <View style={styles.replyBox}>
        <TextInput
          placeholder={i18n.t("writeReply")}
          value={newReply}
          onChangeText={setNewReply}
          style={styles.input}
        />
        <Button title={i18n.t("reply")} onPress={handleReply} />
      </View>
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

  replyBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderTopWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fafafa",
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
