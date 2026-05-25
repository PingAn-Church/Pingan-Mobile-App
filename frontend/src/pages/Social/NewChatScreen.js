// import React, { useContext, useEffect, useState } from "react";
// import {
//   View,
//   Text,
//   FlatList,
//   TouchableOpacity,
//   StyleSheet,
//   ActivityIndicator,
// } from "react-native";
// import { getAllUsers, startPrivateChat } from "../../service/UserService";
// import { UserContext } from "../../context/UserContext";
// import { useNavigation } from "@react-navigation/native";
// import { ChatContext } from "../../context/ChatContext";

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

//   return (
//     <View style={styles.container}>
//       {loadingUsers ? (
//         <ActivityIndicator size="large" color="#007aff" />
//       ) : (
//         <>
//           <FlatList
//             data={users}
//             keyExtractor={(item) => item.id.toString()}
//             renderItem={({ item }) => (
//               <TouchableOpacity onPress={() => handleStartPrivateChat(item)}>
//                 <Text style={styles.userText}>{item.firstName} {item.lastName}</Text>
//               </TouchableOpacity>
//             )}
//           />
//           <TouchableOpacity
//             style={styles.groupButton}
//             onPress={() => navigation.navigate("NewGroup")}
//           >
//             <Text style={styles.groupButtonText}>+ Create Group</Text>
//           </TouchableOpacity>
//         </>
//       )}
//     </View>
//   );
// };

// export default NewChatScreen;

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: "#fff",
//     padding: 16,
//   },
//   userText: {
//     fontSize: 16,
//     paddingVertical: 12,
//   },
//   groupButton: {
//     marginTop: 20,
//     alignItems: "center",
//   },
//   groupButtonText: {
//     color: "#007aff",
//     fontWeight: "bold",
//     fontSize: 16,
//   },
// });

import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from "react-native";
import { getAllUsers, startPrivateChat } from "../../service/UserService";
import { UserContext } from "../../context/UserContext";
import { useNavigation } from "@react-navigation/native";
import { ChatContext } from "../../context/ChatContext";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";

const NewChatScreen = () => {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const { user } = useContext(UserContext);
  const navigation = useNavigation();
  const { conversations } = useContext(ChatContext);
  const { language } = useContext(LanguageContext);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("newChat"),
    });
  }, [language]);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      const allUsers = await getAllUsers();
      setUsers(allUsers.filter((u) => u.id !== user.id));
      setLoadingUsers(false);
    };
    fetchUsers();
  }, []);

  const handleStartPrivateChat = async (selectedUser) => {
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
      Alert.alert(i18n.t("error"), i18n.t("unableStartPrivateChat"), [
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
        {item.firstName} {item.lastName}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>{i18n.t("startNewChat")}</Text>

      {loadingUsers ? (
        <ActivityIndicator size="large" color="#007aff" />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={<View style={styles.separator} />}
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
