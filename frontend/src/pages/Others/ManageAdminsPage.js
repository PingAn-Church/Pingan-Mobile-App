import { showAlert } from "../../utils/showAlert";
import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getAdminUsers,
  getVerifiedUsers,
  updateUserAdminStatus,
  updateUserVerifiedStatus,
  getAllUsers,
  updateUserActiveStatus,
  getInactiveUsers,
} from "../../service/UserService";
import { UserContext } from "../../context/UserContext";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { useNavigation } from "@react-navigation/native";
import { userMatchesSearch } from "../../utils/userSearch";

export default function ManageAdminsPage() {
  const { user } = useContext(UserContext);
  const [admins, setAdmins] = useState([]);
  const [verifiedUsers, setVerifiedUsers] = useState([]);
  const [search, setSearch] = useState("");
  const { language } = useContext(LanguageContext);
  const navigation = useNavigation();

  // Fetch data when the page loads
  useEffect(() => {
    if (!user) return;
    navigation.setOptions({
      headerBackTitle: i18n.t("back"),
    });
    loadUsers();
  }, [language]);

  const loadUsers = async () => {
    try {
      const adminList = await getAdminUsers();
      const verifiedList = await getVerifiedUsers();

      const filteredVerified = verifiedList.filter(
        (u) => u.id !== user.id && u.admin === false
      );

      setAdmins(adminList);
      setVerifiedUsers(filteredVerified);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  // Remove admin (moves to verified users)
  const handleRemoveAdmin = async (userId) => {
    try {
      if (admins.length === 1) {
        showAlert(i18n.t("error"), i18n.t("atLeastOneAdmin"), [
          { text: i18n.t("ok") },
        ]);
        return;
      }
      await updateUserAdminStatus(userId, false);
      loadUsers(); // Refresh the lists
    } catch (error) {
      console.error("Error removing admin:", error);
      showAlert(i18n.t("error"), i18n.t("removeAdminFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  // Add admin (moves to admin list)
  const handleAddAdmin = async (userId) => {
    try {
      await updateUserAdminStatus(userId, true);
      loadUsers();
    } catch (error) {
      console.error("Error adding admin:", error);
      showAlert(i18n.t("error"), i18n.t("addAdminFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  const filteredAdmins = admins.filter((u) => userMatchesSearch(u, search));
  const filteredVerified = verifiedUsers.filter((u) => userMatchesSearch(u, search));

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>{i18n.t("manageAdmins")}</Text>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder={i18n.t("searchUsers")}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      <Text style={styles.subHeader}>{i18n.t("currentAdmins")}</Text>
      {filteredAdmins.length > 0 ? (
        filteredAdmins.map((admin) => (
          <View key={admin.id} style={styles.userItem}>
            <Text style={styles.userName}>
              {admin.firstName} {admin.lastName}
              {admin.id === user.id ? i18n.t("you") : ""}
            </Text>
            {admin.id !== user.id && (
              <TouchableOpacity
                onPress={() => handleRemoveAdmin(admin.id)}
                style={styles.iconButton}
              >
                <Ionicons name="person-remove" size={24} color="red" />
              </TouchableOpacity>
            )}
          </View>
        ))
      ) : (
        <Text style={styles.noData}>{i18n.t("noAdmins")}</Text>
      )}

      <Text style={styles.subHeader}>{i18n.t("verifiedUsers")}</Text>
      {filteredVerified.length > 0 ? (
        filteredVerified.map((user) => (
          <View key={user.id} style={styles.userItem}>
            <Text style={styles.userName}>
              {user.firstName} {user.lastName}
            </Text>
            <TouchableOpacity
              onPress={() => handleAddAdmin(user.id)}
              style={styles.iconButton}
            >
              <Ionicons name="person-add" size={24} color="green" />
            </TouchableOpacity>
          </View>
        ))
      ) : (
        <Text style={styles.noData}>{i18n.t("noVerifiedUsers")}</Text>
      )}
    </ScrollView>
  );
}

export function ManageUsersPage() {
  const { user } = useContext(UserContext);
  const [verifiedUsers, setVerifiedUsers] = useState([]);
  const [notVerifiedUsers, setNotVerifiedUsers] = useState([]);
  const [inactiveUsers, setInactiveUsers] = useState([]);
  const [search, setSearch] = useState("");
  const { language } = useContext(LanguageContext);
  const navigation = useNavigation();

  // Fetch data when the page loads
  useEffect(() => {
    if (!user) return;
    navigation.setOptions({
      headerBackTitle: i18n.t("back"),
    });
    loadUsers();
  }, [language]);

  const loadUsers = async () => {
    try {
      const verifiedList = await getVerifiedUsers();
      const notVerifiedList = await getAllUsers();
      const inactiveList = await getInactiveUsers();

      const filteredVerified = verifiedList.filter(
        (u) => u.id !== user.id && u.admin === false
      );
      const filteredNotVerified = notVerifiedList.filter(
        (u) => u.id !== user.id && u.admin === false && u.verifiedUser === false
      );

      setVerifiedUsers(filteredVerified);
      setNotVerifiedUsers(filteredNotVerified);
      setInactiveUsers(inactiveList.filter((u) => u.id !== user.id));
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const canDeactivate = (u) => !u.admin && u.id !== user.id;

  const confirmDeactivate = (target) => {
    showAlert(
      i18n.t("deactivateUserTitle"),
      `${target.firstName} ${target.lastName} — ${i18n.t("deactivateUserMessage")}`,
      [
        { text: i18n.t("cancel"), style: "cancel" },
        { text: i18n.t("continue"), onPress: () => confirmDeactivateFinal(target) },
      ]
    );
  };

  const confirmDeactivateFinal = (target) => {
    showAlert(i18n.t("areYouSure"), i18n.t("deactivateConfirmMessage"), [
      { text: i18n.t("cancel"), style: "cancel" },
      { text: i18n.t("deactivate"), onPress: () => doDeactivate(target.id) },
    ]);
  };

  const doDeactivate = async (userId) => {
    try {
      await updateUserActiveStatus(userId, false);
      loadUsers();
    } catch (error) {
      console.error("Error deactivating user:", error);
      showAlert(i18n.t("error"), i18n.t("deactivateFailed"), [{ text: i18n.t("ok") }]);
    }
  };

  const handleReactivate = async (userId) => {
    try {
      await updateUserActiveStatus(userId, true);
      loadUsers();
    } catch (error) {
      console.error("Error reactivating user:", error);
      showAlert(i18n.t("error"), i18n.t("reactivateFailed"), [{ text: i18n.t("ok") }]);
    }
  };

  // Remove from verified (moves to not verified)
  const handleRemoveVerified = async (userId) => {
    try {
      await updateUserVerifiedStatus(userId, false);
      loadUsers();
    } catch (error) {
      console.error("Error removing verified user:", error);
      showAlert(i18n.t("error"), i18n.t("removeVerifiedUserFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  // Add to verified (moves to verified list)
  const handleAddVerified = async (userId) => {
    try {
      await updateUserVerifiedStatus(userId, true);
      loadUsers();
    } catch (error) {
      console.error("Error adding verified user:", error);
      showAlert(i18n.t("error"), i18n.t("addVerifiedUserFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  const renderUserItem = (rowUser, action, icon, iconColor) => (
    <View key={rowUser.id} style={styles.userItem}>
      <View style={styles.userLeft}>
        {canDeactivate(rowUser) && (
          <TouchableOpacity
            onPress={() => confirmDeactivate(rowUser)}
            style={styles.iconButton}
            accessibilityLabel={i18n.t("deactivate")}
          >
            <Ionicons name="remove-circle" size={24} color="red" />
          </TouchableOpacity>
        )}
        <Text style={styles.userName}>
          {rowUser.firstName} {rowUser.lastName}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => action(rowUser.id)}
        style={styles.iconButton}
      >
        <Ionicons name={icon} size={24} color={iconColor} />
      </TouchableOpacity>
    </View>
  );

  const shownVerified = verifiedUsers.filter((u) => userMatchesSearch(u, search));
  const shownNotVerified = notVerifiedUsers.filter((u) => userMatchesSearch(u, search));
  const shownInactive = inactiveUsers.filter((u) => userMatchesSearch(u, search));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      <Text style={styles.header}>{i18n.t("manageUsers")}</Text>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder={i18n.t("searchUsers")}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      <Text style={styles.subHeader}>{i18n.t("verifiedUsers")}</Text>
      {shownVerified.length > 0 ? (
        shownVerified.map((item) => (
          <View key={item.id}>
            {renderUserItem(item, handleRemoveVerified, "person-remove", "red")}
          </View>
        ))
      ) : (
        <Text style={styles.noData}>{i18n.t("noVerifiedUsers")}</Text>
      )}

      <Text style={styles.subHeader}>{i18n.t("notVerifiedUsers")}</Text>
      {shownNotVerified.length > 0 ? (
        shownNotVerified.map((item) => (
          <View key={item.id}>
            {renderUserItem(item, handleAddVerified, "person-add", "green")}
          </View>
        ))
      ) : (
        <Text style={styles.noData}>{i18n.t("noNotVerifiedUsers")}</Text>
      )}

      <Text style={styles.subHeader}>{i18n.t("inactiveUsers")}</Text>
      {shownInactive.length > 0 ? (
        shownInactive.map((item) => (
          <View key={item.id} style={styles.userItem}>
            <Text style={styles.userName}>
              {item.firstName} {item.lastName}
            </Text>
            <TouchableOpacity
              onPress={() => handleReactivate(item.id)}
              style={styles.iconButton}
              accessibilityLabel={i18n.t("reactivate")}
            >
              <Ionicons name="refresh-circle" size={24} color="green" />
            </TouchableOpacity>
          </View>
        ))
      ) : (
        <Text style={styles.noData}>{i18n.t("noInactiveUsers")}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  scrollContent: { paddingBottom: 50 },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  subHeader: {
    fontSize: 20,
    fontWeight: "bold",
    marginVertical: 10,
    marginTop: 25,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 2,
  },
  userItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    borderRadius: 8,
    backgroundColor: "#fff",
    marginBottom: 8,
    elevation: 2,
  },
  userLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  userName: {
    fontSize: 18,
  },
  iconButton: {
    padding: 8,
    borderRadius: 5,
  },
  noData: {
    fontSize: 16,
    color: "gray",
    textAlign: "center",
    marginVertical: 10,
  },
});
