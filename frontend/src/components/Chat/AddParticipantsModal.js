
// const AddParticipantsModal = ({ visible, onClose, conversationId, existingParticipants, setParticipantDetails }) => {
//   const [allUsers, setAllUsers] = useState([]);
//   const [selectedUsers, setSelectedUsers] = useState([]);
//   const [searchQuery, setSearchQuery] = useState("");

//   useEffect(() => {
//     const fetchUsers = async () => {
//       try {
//         const users = await getAllUsers();
//         setAllUsers(users);
//       } catch (error) {
//         console.error("Error fetching users:", error);
//       }
//     };
//     fetchUsers();
//   }, []);

//   const filteredUsers = allUsers.filter(
//     (user) =>
//       !existingParticipants.some((p) => p.id === user.id) &&
//       (user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
//         user.lastName.toLowerCase().includes(searchQuery.toLowerCase()))
//   );

//   const handleAddParticipants = async () => {
//     try {
//       for (const user of selectedUsers) {
//         await addParticipantToGroup(conversationId, user.id);
//       }
//       setParticipantDetails([...existingParticipants, ...selectedUsers]);
//       onClose();
//     } catch (error) {
//       console.error("Error adding participants:", error);
//     }
//   };

//         <TextInput
//           style={styles.searchBar}
//           placeholder="Search users..."
//           value={searchQuery}
//           onChangeText={setSearchQuery}
//         />

// export default AddParticipantsModal;

// const styles = StyleSheet.create({
//   modalContainer: { flex: 1, backgroundColor: "#fff", padding: 20 },
//   header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
//   headerTitle: { fontSize: 18, fontWeight: "bold" },
//   headerButton: { fontSize: 16, color: "#007aff" },
//   searchBar: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginBottom: 10 },
//   userItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: "#ddd" },
//   selectedUser: { backgroundColor: "#D0E7FF" },
//   userText: { fontSize: 16 },
// });

import React, { useState, useContext } from "react";
import {
  Modal,
  SafeAreaView,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  View,
} from "react-native";
import { addParticipantToGroup } from "../../service/ChatService";
import { getStompClient } from "../../service/WebSocketService";
import { getUserById } from "../../service/UserService";
import useUserSearch from "../../hooks/useUserSearch";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { LanguageContext } from "../../context/LanguageContext";

const AddParticipantsModal = ({
  visible,
  onClose,
  conversationId,
  existingParticipants,
  setParticipantDetails,
  assistant,
}) => {
  const [selectedUsers, setSelectedUsers] = useState([]);
  const { language } = useContext(LanguageContext);
  const { query, setQuery, results, loading, loadingMore, hasMore, loadMore } =
    useUserSearch();

  // Server-side search returns active users; hide anyone already in the group.
  const availableUsers = results.filter(
    (u) => !existingParticipants.some((p) => String(p.id) === String(u.id))
  );

  /**
   * The assistant, pinned to the top of the list.
   *
   * Adding it to the group is what switches it on, so it has to be offerable here
   * — but it is deliberately absent from the user directory, so the search will
   * never return it. Its identity rides on the conversation instead.
   *
   * Matched against both names so "sha" and "平安" each find it, and rendered in
   * whichever name the reader's language calls for.
   */
  const assistantEntry = (() => {
    if (!assistant?.id) return null;
    if (existingParticipants.some((p) => String(p.id) === String(assistant.id))) return null;

    const names = [assistant.name, assistant.nameZh].filter(Boolean);
    if (!names.length) return null;

    const term = query.trim().toLowerCase();
    if (term && !names.some((name) => name.toLowerCase().includes(term))) return null;

    const preferred =
      String(language || "").startsWith("zh") && assistant.nameZh
        ? assistant.nameZh
        : assistant.name;
    return { id: assistant.id, firstName: preferred || names[0], lastName: "", isAssistant: true };
  })();

  const listData = assistantEntry ? [assistantEntry, ...availableUsers] : availableUsers;

  //       }
  //       setParticipantDetails([...existingParticipants, ...selectedUsers]);
  //       onClose();
  //     } catch (error) {
  //       console.error("Error adding participants:", error);
  //     }
  //   };

  // const handleAddParticipants = async () => {
  //     try {
  //         for (const user of selectedUsers) {
  //             const updatedConversation = await addParticipantToGroup(conversationId, user.id); // ✅ API returns updated conversation

  //             const stompClient = getStompClient();
  //             if (stompClient && stompClient.connected) {
  //                 stompClient.publish({
  //                     destination: "/app/participantAdded",
  //                     body: JSON.stringify(updatedConversation), // ✅ Use correct reference
  //                 });
  //                 console.log("📡 WebSocket: Published Group Update:", updatedConversation);
  //             }

  //             // ✅ Update participant details in the UI immediately
  //             setParticipantDetails(updatedConversation.participants);
  //         }
  //         onClose();
  //     } catch (error) {
  //         console.error("❌ Error adding participants:", error);
  //     }
  // };

  // const handleAddParticipants = async () => {
  //     try {
  //         for (const user of selectedUsers) {
  //             const updatedConversation = await addParticipantToGroup(conversationId, user.id);

  //             if (!updatedConversation || !updatedConversation.conversationId) {
  //                 console.error("❌ Received invalid conversation update:", updatedConversation);
  //                 continue;
  //             }

  //             const stompClient = getStompClient();
  //             if (stompClient && stompClient.connected) {
  //                 stompClient.publish({
  //                     destination: "/app/participantAdded",
  //                     body: JSON.stringify(updatedConversation),
  //                 });
  //                 console.log("📡 WebSocket: Published Participant Update:", updatedConversation);
  //             }

  //             // ✅ Update participant details in the UI immediately
  //             setParticipantDetails(updatedConversation.participants);
  //         }
  //         onClose();
  //     } catch (error) {
  //         console.error("❌ Error adding participants:", error);
  //     }
  // };

  // const handleAddParticipants = async () => {
  //     try {
  //         for (const user of selectedUsers) {
  //             const updatedConversation = await addParticipantToGroup(conversationId, user.id);

  //             if (!updatedConversation || !updatedConversation.conversationId) {
  //                 console.error("❌ Received invalid conversation update:", updatedConversation);
  //                 continue;
  //             }

  //             // ✅ Fetch full participant details

  //             // ✅ Remove null values (failed fetches)
  //             const filteredParticipants = fullParticipants.filter(Boolean);

  //             // ✅ Update UI with the complete participant details
  //             setParticipantDetails(filteredParticipants);

  //             // ✅ Publish WebSocket event

  // const handleAddParticipants = async () => {
  //     try {
  //         let newlyAddedParticipants = [];

  //         for (const user of selectedUsers) {
  //             const updatedConversation = await addParticipantToGroup(conversationId, user.id);

  //             if (!updatedConversation || !updatedConversation.conversationId) {
  //                 console.error("❌ Invalid conversation update received:", updatedConversation);
  //                 continue;
  //             }

  //             // ✅ Fetch full participant details
  //             const participantDetails = await getUserById(user.id);
  //             newlyAddedParticipants.push(participantDetails);

  //             // ✅ Publish WebSocket event
  //             const stompClient = getStompClient();
  //             if (stompClient && stompClient.connected) {
  //                 stompClient.publish({
  //                     destination: "/app/participantAdded",
  //                     body: JSON.stringify(updatedConversation),
  //                 });
  //                 console.log("📡 WebSocket: Published Participant Update:", updatedConversation);
  //             }
  //         }

  //         // ✅ Update UI: Merge existing participants with newly added ones
  //         setParticipantDetails([...existingParticipants, ...newlyAddedParticipants]);
  //         onClose();
  //     } catch (error) {
  //         console.error("❌ Error adding participants:", error);
  //     }
  // };

  // const handleAddParticipants = async () => {
  //   try {
  //       let newlyAddedParticipants = [];

  //       for (const user of selectedUsers) {
  //           const updatedConversation = await addParticipantToGroup(conversationId, user.id);

  //           if (!updatedConversation || !updatedConversation.conversationId) {
  //               console.error("❌ Invalid conversation update received:", updatedConversation);
  //               continue;
  //           }

  //           // ✅ Fetch full participant details
  //           const participantDetails = await getUserById(user.id);
  //           newlyAddedParticipants.push(participantDetails);

  //           // ✅ Publish WebSocket event
  //           // const stompClient = getStompClient();
  //           // if (stompClient && stompClient.connected) {
  //           //     stompClient.publish({
  //           //         destination: "/app/participantAdded",
  //           //         body: JSON.stringify(updatedConversation), // ✅ Send full conversation
  //           //     });
  //           //     console.log("📡 WebSocket: Published Participant Update:", updatedConversation);
  //           // }
  //       }

  //       // ✅ Update UI immediately
  //       setParticipantDetails([...existingParticipants, ...newlyAddedParticipants]);
  //       onClose();
  //   } catch (error) {
  //       console.error("❌ Error adding participants:", error);
  //   }
  // };

  const handleAddParticipants = async () => {
    try {
      for (const user of selectedUsers) {
        const updatedConversation = await addParticipantToGroup(
          conversationId,
          user.id
        );

        if (!updatedConversation || !updatedConversation.conversationId) {
          console.error(
            "❌ Invalid conversation update received:",
            updatedConversation
          );
          continue;
        }
      }
      onClose();
    } catch (error) {
      console.error("❌ Error adding participants:", error);
    }
  };

  return (
    <Modal visible={visible} animationType="slide">
      {/* Modals don't get the activity's adjustResize, so avoid the keyboard explicitly. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      <SafeAreaView style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.headerButton}>{i18n.t("cancel")}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{i18n.t("addParticipants")}</Text>
          <TouchableOpacity onPress={handleAddParticipants}>
            <Text style={[styles.headerButton, styles.doneButton]}>
              {i18n.t("done")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <TextInput
          style={styles.searchBar}
          placeholder={i18n.t("searchUsers")}
          placeholderTextColor="#999"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />

        {/* User List */}
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => {
            const isSelected = selectedUsers.some((u) => u.id === item.id);
            return (
              <TouchableOpacity
                style={[styles.userItem, isSelected && styles.selectedUser]}
                onPress={() =>
                  setSelectedUsers((prev) =>
                    isSelected
                      ? prev.filter((u) => u.id !== item.id)
                      : [...prev, item]
                  )
                }
              >
                <View style={styles.userRow}>
                  <Text style={styles.userText}>
                    {formatName(item.firstName, item.lastName)}
                  </Text>
                  {item.isAssistant && (
                    <View style={styles.assistantBadge}>
                      <Text style={styles.assistantBadgeText}>{i18n.t("aiBadge")}</Text>
                    </View>
                  )}
                </View>
                {item.isAssistant && (
                  <Text style={styles.assistantHint}>{i18n.t("assistantAddHint")}</Text>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            loading ? null : (
              <Text style={styles.emptyText}>{i18n.t("noUsersFound")}</Text>
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color="#007aff" style={{ marginVertical: 16 }} />
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          keyboardShouldPersistTaps="handled"
        />
      </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default AddParticipantsModal;

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 20,
    // React Native's SafeAreaView only insets on iOS — on Android it renders as a
    // plain View, so Cancel and Done sat underneath the status bar. Measure it
    // instead. (react-native-safe-area-context is installed but unused, and its
    // hook would need a SafeAreaProvider added at the app root, which would move
    // layout on every screen for the sake of one modal.)
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 20 : 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  headerButton: {
    fontSize: 16,
    color: "#007aff",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  doneButton: {
    fontWeight: "600",
  },
  searchBar: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    marginHorizontal: 10,
  },
  userItem: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  selectedUser: {
    backgroundColor: "#D0E7FF",
  },
  userText: {
    fontSize: 16,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  assistantBadge: {
    backgroundColor: "#E7E3FF",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  assistantBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#5B4BD6",
    letterSpacing: 0.4,
  },
  assistantHint: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 2,
  },
  emptyText: {
    textAlign: "center",
    color: "#9ca3af",
    marginTop: 24,
    fontSize: 15,
  },
});
