
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
}) => {
  const [selectedUsers, setSelectedUsers] = useState([]);
  const { language } = useContext(LanguageContext);
  const { query, setQuery, results, loading, loadingMore, hasMore, loadMore } =
    useUserSearch();

  // Server-side search returns active users; hide anyone already in the group.
  const availableUsers = results.filter(
    (u) => !existingParticipants.some((p) => String(p.id) === String(u.id))
  );

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
          data={availableUsers}
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
                <Text style={styles.userText}>
                  {formatName(item.firstName, item.lastName)}
                </Text>
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
  emptyText: {
    textAlign: "center",
    color: "#9ca3af",
    marginTop: 24,
    fontSize: 15,
  },
});
