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
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
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
import { makeStyles, useTheme } from "../../theme";
import { AppText, Button, Heading, TextField } from "../../components/ui";

const NewChatScreen = () => {
  const styles = useStyles();
  const { colors } = useTheme();
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
      accessibilityRole="button"
    >
      <AppText variant="body" color="textPrimary">
        {formatName(item.firstName, item.lastName)}
      </AppText>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Heading level={2} style={styles.header}>
        {i18n.t("startNewChat")}
      </Heading>

      <View style={styles.searchBar}>
        <TextField
          style={styles.searchInput}
          placeholder={i18n.t("searchUsers")}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <AppText variant="secondary" style={styles.emptyText}>
              {i18n.t("noUsersFound")}
            </AppText>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.primary} style={styles.loadingMore} />
            ) : (
              <View style={styles.separator} />
            )
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <Button
        size="md"
        title={`+ ${i18n.t("createGroup")}`}
        accessibilityLabel={i18n.t("createGroup")}
        onPress={() => navigation.navigate("NewGroup")}
        style={styles.groupButton}
      />
    </SafeAreaView>
  );
};

export default NewChatScreen;

// Layout only — text, the search field and the button get their look from the ui components.
const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  header: {
    paddingVertical: t.spacing.base,
    paddingHorizontal: t.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
    backgroundColor: t.colors.background,
  },
  searchBar: {
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
  },
  searchInput: {
    backgroundColor: t.colors.inputFilled,
    borderWidth: 0,
    borderRadius: t.radius.card,
    paddingHorizontal: t.spacing.md,
  },
  loading: {
    marginTop: t.spacing.lg,
  },
  loadingMore: {
    marginVertical: t.spacing.base,
  },
  emptyText: {
    textAlign: "center",
    marginTop: t.spacing.xl,
  },
  userRow: {
    paddingVertical: t.spacing.base,
    paddingHorizontal: t.spacing.lg,
    backgroundColor: t.colors.surface,
  },
  separator: {
    height: 1,
    backgroundColor: t.colors.borderSubtle,
    marginLeft: 0, // Full-width border
  },
  groupButton: {
    margin: t.spacing.lg,
  },
}));
