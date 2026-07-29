import { showAlert } from "../../utils/showAlert";

// const NewChatScreen = () => {
//   const [users, setUsers] = useState([]);
//   const [loadingUsers, setLoadingUsers] = useState(false);
//   const { user } = useContext(UserContext);
//   const navigation = useNavigation();
//   const { conversations } = useContext(ChatContext);

//   useEffect(() => {
//     const fetchUsers = async () => {
//       setLoadingUsers(true);
//       const allUsers = await getAllUsers();
//       setUsers(allUsers.filter(u => u.id !== user.id));
//       setLoadingUsers(false);
//     };
//     fetchUsers();
//   }, []);

//   const handleStartPrivateChat = async (selectedUser) => {
//     const existing = conversations.find(
//       (c) => c.conversationType === "private" && c.participants.includes(selectedUser.id)
//     );

//     if (existing) {
//       navigation.replace("Chat", {
//         conversationId: existing.conversationId,
//       });
//       return;
//     }

//     try {
//       const response = await startPrivateChat([selectedUser.id]);
//       navigation.navigate("Chat", {
//         conversationId: response.data.conversationId,
//       });
//     } catch (error) {
//       alert("Unable to start private chat.");
//     }
//   };

// export default NewChatScreen;

import React, { useContext, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from "react-native";
import { startPrivateChat } from "../../service/UserService";
import { UserContext } from "../../context/UserContext";
import { useNavigation } from "@react-navigation/native";
import { ChatContext } from "../../context/ChatContext";
import useUserSearch from "../../hooks/useUserSearch";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { LanguageContext } from "../../context/LanguageContext";
import { getBlockStatus, unblockUser } from "../../service/BlockService";
import { confirmAction } from "../../utils/confirmAction";

const NewChatScreen = () => {
  const { user } = useContext(UserContext);
  const navigation = useNavigation();
  const { conversations } = useContext(ChatContext);
  const { language } = useContext(LanguageContext);
  const { query, setQuery, results, loading, loadingMore, hasMore, loadMore } =
    useUserSearch({ excludeId: user?.id });

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("newChat"),
    });
  }, [language]);

  const handleStartPrivateChat = async (selectedUser) => {
    // Tapping a user I've blocked offers to unblock them first (the alternate
    // unblock path besides the detail page's green Unblock button).
    try {
      const status = await getBlockStatus(selectedUser.id);
      if (status?.blockedByMe) {
        const confirmed = await confirmAction({
          title: i18n.t("unblockUser"),
          message: i18n.t("blockedUserTapAsk"),
          confirmText: i18n.t("unblockUser"),
          cancelText: i18n.t("cancel"),
        });
        if (!confirmed) return;
        await unblockUser(selectedUser.id);
      }
    } catch (error) {
      console.error("Block status check failed:", error);
      // Fall through — the server still refuses messaging if a block remains.
    }

    const existing = conversations.find(
      (c) =>
        c.conversationType === "private" &&
        c.participants.includes(selectedUser.id)
    );

    if (existing) {
      navigation.replace("Chat", {
        conversationId: existing.conversationId,
      });
      return;
    }

    try {
      const response = await startPrivateChat([selectedUser.id]);
      navigation.replace("Chat", {
        conversationId: response.data.conversationId,
      });
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("unableStartPrivateChat"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.userRow}
      onPress={() => handleStartPrivateChat(item)}
    >
      <Text style={styles.userName}>
        {formatName(item.firstName, item.lastName)}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>{i18n.t("startNewChat")}</Text>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder={i18n.t("searchUsers")}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#007aff" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{i18n.t("noUsersFound")}</Text>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color="#007aff" style={{ marginVertical: 16 }} />
            ) : (
              <View style={styles.separator} />
            )
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <TouchableOpacity
        style={styles.groupButton}
        onPress={() => navigation.navigate("NewGroup")}
      >
        <Text style={styles.groupButtonText}>+ {i18n.t("createGroup")}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default NewChatScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    fontSize: 20,
    fontWeight: "600",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  searchBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  searchInput: {
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  emptyText: {
    textAlign: "center",
    color: "#9ca3af",
    marginTop: 24,
    fontSize: 15,
  },
  userRow: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
  },
  userName: {
    fontSize: 16,
    color: "#1f2937",
  },
  separator: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginLeft: 0, // Full-width border
  },
  groupButton: {
    margin: 20,
    alignItems: "center",
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    borderRadius: 10,
  },
  groupButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
