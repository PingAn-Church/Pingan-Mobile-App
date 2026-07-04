import { showAlert } from "../../utils/showAlert";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SectionList,
  ActivityIndicator,
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
  deleteUser,
  getDeletedAccounts,
  purgeDeletedAccount,
} from "../../service/UserService";
import { UserContext } from "../../context/UserContext";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { useNavigation } from "@react-navigation/native";

const PAGE_SIZE = 20;

const emptyPage = () => ({
  items: [],
  page: 0,
  hasMore: true,
  loading: false,
  refreshing: false,
  totalCount: 0,
});

const pagedItems = (response) => (Array.isArray(response?.data) ? response.data : []);

const pagedInfo = (response, fallbackPage, fallbackCount) => {
  const pagination = response?.pagination || {};
  return {
    page: Number.isFinite(Number(pagination.page)) ? Number(pagination.page) : fallbackPage,
    hasMore: Boolean(pagination.hasMore),
    totalCount:
      typeof pagination.totalCount === "number" ? pagination.totalCount : fallbackCount,
  };
};

const mergeUnique = (previous, next) => {
  const map = new Map();
  previous.forEach((item) => map.set(String(item.id), item));
  next.forEach((item) => map.set(String(item.id), item));
  return Array.from(map.values());
};

const searchTrim = (value) => String(value || "").trim();

const buildRows = (sectionKey, state, emptyText) => {
  if (state.loading && state.items.length === 0) {
    return [{ __rowKey: `${sectionKey}-loading`, __loading: true }];
  }
  if (!state.loading && state.items.length === 0) {
    return [{ __rowKey: `${sectionKey}-empty`, __empty: true, emptyText }];
  }

  const rows = state.items.map((item) => ({
    ...item,
    __rowKey: `${sectionKey}-${item.id}`,
  }));

  if (state.hasMore || state.loading) {
    rows.push({ __rowKey: `${sectionKey}-more`, __loadMore: true, sectionKey });
  }
  return rows;
};

function SearchHeader({ title, search, setSearch }) {
  return (
    <>
      <Text style={styles.header}>{title}</Text>
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
    </>
  );
}

function SystemRow({ item }) {
  if (item.__loading) {
    return <ActivityIndicator style={styles.systemRow} color="#007bff" />;
  }
  if (item.__empty) {
    return <Text style={styles.noData}>{item.emptyText}</Text>;
  }
  if (item.__loadMore) {
    return <ActivityIndicator style={styles.systemRow} color="#007bff" />;
  }
  return null;
}

export default function ManageAdminsPage() {
  const { user } = useContext(UserContext);
  const [admins, setAdmins] = useState(emptyPage);
  const [verifiedUsers, setVerifiedUsers] = useState(emptyPage);
  const [search, setSearch] = useState("");
  const { language } = useContext(LanguageContext);
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ headerBackTitle: i18n.t("back") });
  }, [language, navigation]);

  const loadSection = useCallback(
    async (sectionKey, page = 0, replace = false) => {
      if (!user) return;
      const term = searchTrim(search);
      const setter = sectionKey === "admins" ? setAdmins : setVerifiedUsers;

      setter((prev) => {
        if (!replace && (prev.loading || !prev.hasMore)) return prev;
        return { ...prev, loading: true };
      });

      try {
        const response =
          sectionKey === "admins"
            ? await getAdminUsers({ q: term, page, size: PAGE_SIZE })
            : await getVerifiedUsers({ q: term, page, size: PAGE_SIZE });
        const rawItems = pagedItems(response);
        const items =
          sectionKey === "verified"
            ? rawItems.filter((u) => u.id !== user.id && u.admin === false)
            : rawItems;
        const info = pagedInfo(response, page, items.length);

        setter((prev) => ({
          items: replace ? items : mergeUnique(prev.items, items),
          page: info.page,
          hasMore: info.hasMore,
          loading: false,
          refreshing: false,
          totalCount: info.totalCount,
        }));
      } catch (error) {
        console.error("Error fetching users:", error);
        setter((prev) => ({ ...prev, loading: false, refreshing: false }));
      }
    },
    [search, user]
  );

  const refreshAll = useCallback(() => {
    setAdmins(emptyPage());
    setVerifiedUsers(emptyPage());
    loadSection("admins", 0, true);
    loadSection("verified", 0, true);
  }, [loadSection]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(refreshAll, 250);
    return () => clearTimeout(timer);
  }, [refreshAll, user]);

  const loadMore = useCallback(
    (sectionKey) => {
      const state = sectionKey === "admins" ? admins : verifiedUsers;
      if (state.loading || !state.hasMore) return;
      loadSection(sectionKey, state.page + 1, false);
    },
    [admins, verifiedUsers, loadSection]
  );

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    viewableItems.forEach(({ item }) => {
      if (item?.__loadMore) {
        loadMoreRef.current(item.sectionKey);
      }
    });
  }).current;
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const handleRemoveAdmin = async (userId) => {
    try {
      // totalCount reflects the current search, so this fast-path check is only
      // reliable when the list is unfiltered; the backend enforces it regardless.
      if (!searchTrim(search) && admins.totalCount <= 1) {
        showAlert(i18n.t("error"), i18n.t("atLeastOneAdmin"), [{ text: i18n.t("ok") }]);
        return;
      }
      await updateUserAdminStatus(userId, false);
      refreshAll();
    } catch (error) {
      console.error("Error removing admin:", error);
      const message =
        error?.response?.status === 409 ? i18n.t("atLeastOneAdmin") : i18n.t("removeAdminFailed");
      showAlert(i18n.t("error"), message, [{ text: i18n.t("ok") }]);
    }
  };

  const handleAddAdmin = async (userId) => {
    try {
      await updateUserAdminStatus(userId, true);
      refreshAll();
    } catch (error) {
      console.error("Error adding admin:", error);
      showAlert(i18n.t("error"), i18n.t("addAdminFailed"), [{ text: i18n.t("ok") }]);
    }
  };

  const sections = useMemo(
    () => [
      {
        key: "admins",
        title: i18n.t("currentAdmins"),
        data: buildRows("admins", admins, i18n.t("noAdmins")),
      },
      {
        key: "verified",
        title: i18n.t("verifiedUsers"),
        data: buildRows("verified", verifiedUsers, i18n.t("noVerifiedUsers")),
      },
    ],
    [admins, verifiedUsers, language]
  );

  const renderItem = ({ item, section }) => {
    if (item.__loading || item.__empty || item.__loadMore) return <SystemRow item={item} />;

    if (section.key === "admins") {
      return (
        <View style={styles.userItem}>
          <Text style={styles.userName}>
            {item.firstName} {item.lastName}
            {item.id === user?.id ? i18n.t("you") : ""}
          </Text>
          {item.id !== user?.id && (
            <TouchableOpacity onPress={() => handleRemoveAdmin(item.id)} style={styles.iconButton}>
              <Ionicons name="person-remove" size={24} color="red" />
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <View style={styles.userItem}>
        <Text style={styles.userName}>
          {item.firstName} {item.lastName}
        </Text>
        <TouchableOpacity onPress={() => handleAddAdmin(item.id)} style={styles.iconButton}>
          <Ionicons name="person-add" size={24} color="green" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SectionList
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      sections={sections}
      keyExtractor={(item) => item.__rowKey}
      ListHeaderComponent={<SearchHeader title={i18n.t("manageAdmins")} search={search} setSearch={setSearch} />}
      renderSectionHeader={({ section }) => <Text style={styles.subHeader}>{section.title}</Text>}
      renderItem={renderItem}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
      keyboardShouldPersistTaps="handled"
    />
  );
}

export function ManageUsersPage() {
  const { user } = useContext(UserContext);
  const [verifiedUsers, setVerifiedUsers] = useState(emptyPage);
  const [notVerifiedUsers, setNotVerifiedUsers] = useState(emptyPage);
  const [inactiveUsers, setInactiveUsers] = useState(emptyPage);
  const [deletedAccounts, setDeletedAccounts] = useState(emptyPage);
  const [search, setSearch] = useState("");
  const { language } = useContext(LanguageContext);
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ headerBackTitle: i18n.t("back") });
  }, [language, navigation]);

  const loadSection = useCallback(
    async (sectionKey, page = 0, replace = false) => {
      if (!user) return;
      const term = searchTrim(search);
      const setters = {
        verified: setVerifiedUsers,
        notVerified: setNotVerifiedUsers,
        inactive: setInactiveUsers,
        deleted: setDeletedAccounts,
      };
      const setter = setters[sectionKey];

      setter((prev) => {
        if (!replace && (prev.loading || !prev.hasMore)) return prev;
        return { ...prev, loading: true };
      });

      try {
        let response;
        if (sectionKey === "verified") {
          response = await getAllUsers({ q: term, verified: true, active: true, page, size: PAGE_SIZE });
        } else if (sectionKey === "notVerified") {
          response = await getAllUsers({ q: term, verified: false, active: true, page, size: PAGE_SIZE });
        } else if (sectionKey === "inactive") {
          response = await getInactiveUsers({ q: term, page, size: PAGE_SIZE });
        } else {
          response = await getDeletedAccounts({ q: term, page, size: PAGE_SIZE });
        }

        const rawItems = pagedItems(response);
        const items =
          sectionKey === "deleted"
            ? rawItems
            : rawItems.filter((u) => u.id !== user.id && u.admin === false);
        const info = pagedInfo(response, page, items.length);

        setter((prev) => ({
          items: replace ? items : mergeUnique(prev.items, items),
          page: info.page,
          hasMore: info.hasMore,
          loading: false,
          refreshing: false,
          totalCount: info.totalCount,
        }));
      } catch (error) {
        console.error("Error fetching users:", error);
        setter((prev) => ({ ...prev, loading: false, refreshing: false }));
      }
    },
    [search, user]
  );

  const refreshAll = useCallback(() => {
    setVerifiedUsers(emptyPage());
    setNotVerifiedUsers(emptyPage());
    setInactiveUsers(emptyPage());
    setDeletedAccounts(emptyPage());
    loadSection("verified", 0, true);
    loadSection("notVerified", 0, true);
    loadSection("inactive", 0, true);
    loadSection("deleted", 0, true);
  }, [loadSection]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(refreshAll, 250);
    return () => clearTimeout(timer);
  }, [refreshAll, user]);

  const stateByKey = useMemo(
    () => ({
      verified: verifiedUsers,
      notVerified: notVerifiedUsers,
      inactive: inactiveUsers,
      deleted: deletedAccounts,
    }),
    [verifiedUsers, notVerifiedUsers, inactiveUsers, deletedAccounts]
  );

  const loadMore = useCallback(
    (sectionKey) => {
      const state = stateByKey[sectionKey];
      if (!state || state.loading || !state.hasMore) return;
      loadSection(sectionKey, state.page + 1, false);
    },
    [stateByKey, loadSection]
  );

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    viewableItems.forEach(({ item }) => {
      if (item?.__loadMore) loadMoreRef.current(item.sectionKey);
    });
  }).current;

  const canDeactivate = (u) => !u.admin && u.id !== user?.id;

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
      refreshAll();
    } catch (error) {
      console.error("Error deactivating user:", error);
      showAlert(i18n.t("error"), i18n.t("deactivateFailed"), [{ text: i18n.t("ok") }]);
    }
  };

  const handleReactivate = async (userId) => {
    try {
      await updateUserActiveStatus(userId, true);
      refreshAll();
    } catch (error) {
      console.error("Error reactivating user:", error);
      showAlert(i18n.t("error"), i18n.t("reactivateFailed"), [{ text: i18n.t("ok") }]);
    }
  };

  const confirmDeleteUser = (target) => {
    showAlert(
      i18n.t("deleteUserTitle"),
      `${target.firstName} ${target.lastName} — ${i18n.t("deleteUserMessage")}`,
      [
        { text: i18n.t("cancel"), style: "cancel" },
        { text: i18n.t("delete"), style: "destructive", onPress: () => doDeleteUser(target.id) },
      ]
    );
  };

  const doDeleteUser = async (userId) => {
    try {
      await deleteUser(userId);
      refreshAll();
    } catch (error) {
      console.error("Error deleting user:", error);
      showAlert(i18n.t("error"), i18n.t("deleteUserFailed"), [{ text: i18n.t("ok") }]);
    }
  };

  const handleRemoveVerified = async (userId) => {
    try {
      await updateUserVerifiedStatus(userId, false);
      refreshAll();
    } catch (error) {
      console.error("Error removing verified user:", error);
      showAlert(i18n.t("error"), i18n.t("removeVerifiedUserFailed"), [{ text: i18n.t("ok") }]);
    }
  };

  const handleAddVerified = async (userId) => {
    try {
      await updateUserVerifiedStatus(userId, true);
      refreshAll();
    } catch (error) {
      console.error("Error adding verified user:", error);
      showAlert(i18n.t("error"), i18n.t("addVerifiedUserFailed"), [{ text: i18n.t("ok") }]);
    }
  };

  const formatDeletedAt = (value) => {
    if (!value) return i18n.t("unknown");
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  };

  const formatReferences = (references = {}) =>
    Object.entries(references)
      .filter(([, count]) => Number(count) > 0)
      .map(([key, count]) => `${key}: ${count}`)
      .join(", ");

  const confirmPurgeDeletedAccount = (account) => {
    if (!account?.purgeEligible) {
      const refs = formatReferences(account?.references);
      showAlert(i18n.t("purgeDeletedAccountBlocked"), refs || i18n.t("remainingReferences"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    showAlert(i18n.t("purgeDeletedAccountTitle"), i18n.t("purgeDeletedAccountMessage"), [
      { text: i18n.t("cancel"), style: "cancel" },
      {
        text: i18n.t("delete"),
        style: "destructive",
        onPress: () => doPurgeDeletedAccount(account.id),
      },
    ]);
  };

  const doPurgeDeletedAccount = async (userId) => {
    try {
      await purgeDeletedAccount(userId);
      refreshAll();
    } catch (error) {
      console.error("Error purging deleted account:", error);
      const refs = formatReferences(error?.response?.data?.references);
      const message =
        typeof error?.response?.data?.message === "string"
          ? error.response.data.message
          : i18n.t("purgeDeletedAccountFailed");
      showAlert(i18n.t("error"), refs ? `${message}\n${refs}` : message, [{ text: i18n.t("ok") }]);
    }
  };

  const renderUserItem = (rowUser, action, icon, iconColor) => (
    <View style={styles.userItem}>
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
      <TouchableOpacity onPress={() => action(rowUser.id)} style={styles.iconButton}>
        <Ionicons name={icon} size={24} color={iconColor} />
      </TouchableOpacity>
    </View>
  );

  const sections = useMemo(
    () => [
      {
        key: "verified",
        title: i18n.t("verifiedUsers"),
        data: buildRows("verified", verifiedUsers, i18n.t("noVerifiedUsers")),
      },
      {
        key: "notVerified",
        title: i18n.t("notVerifiedUsers"),
        data: buildRows("notVerified", notVerifiedUsers, i18n.t("noNotVerifiedUsers")),
      },
      {
        key: "inactive",
        title: i18n.t("inactiveUsers"),
        data: buildRows("inactive", inactiveUsers, i18n.t("noInactiveUsers")),
      },
      {
        key: "deleted",
        title: i18n.t("deletedAccounts"),
        data: buildRows("deleted", deletedAccounts, i18n.t("noDeletedAccounts")),
      },
    ],
    [verifiedUsers, notVerifiedUsers, inactiveUsers, deletedAccounts, language]
  );

  const renderItem = ({ item, section }) => {
    if (item.__loading || item.__empty || item.__loadMore) return <SystemRow item={item} />;

    if (section.key === "verified") {
      return renderUserItem(item, handleRemoveVerified, "person-remove", "red");
    }
    if (section.key === "notVerified") {
      return renderUserItem(item, handleAddVerified, "person-add", "green");
    }
    if (section.key === "inactive") {
      return (
        <View style={styles.userItem}>
          <View style={styles.userLeft}>
            <TouchableOpacity
              onPress={() => confirmDeleteUser(item)}
              style={styles.iconButton}
              accessibilityLabel={i18n.t("deleteUserTitle")}
            >
              <Ionicons name="trash" size={24} color="red" />
            </TouchableOpacity>
            <Text style={styles.userName}>
              {item.firstName} {item.lastName}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => handleReactivate(item.id)}
            style={styles.iconButton}
            accessibilityLabel={i18n.t("reactivate")}
          >
            <Ionicons name="refresh-circle" size={24} color="green" />
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.userItem}>
        <View style={styles.deletedAccountTextBlock}>
          <Text style={styles.userName}>{item.displayName}</Text>
          <Text style={styles.deletedAccountMeta}>
            {i18n.t("deletedAt")}: {formatDeletedAt(item.deletedAt)}
          </Text>
          <Text style={styles.deletedAccountMeta}>
            {i18n.t("remainingReferences")}: {item.referenceCount}
          </Text>
          {item.referenceCount > 0 && (
            <Text style={styles.deletedAccountRefs}>{formatReferences(item.references)}</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => confirmPurgeDeletedAccount(item)}
          style={[styles.iconButton, !item.purgeEligible && styles.disabledIconButton]}
          disabled={!item.purgeEligible}
          accessibilityLabel={i18n.t("purgeDeletedAccountTitle")}
        >
          <Ionicons name="trash" size={24} color={item.purgeEligible ? "red" : "#aaa"} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SectionList
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      sections={sections}
      keyExtractor={(item) => item.__rowKey}
      ListHeaderComponent={<SearchHeader title={i18n.t("manageUsers")} search={search} setSearch={setSearch} />}
      renderSectionHeader={({ section }) => <Text style={styles.subHeader}>{section.title}</Text>}
      renderItem={renderItem}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: "#f5f5f5",
  },
  scrollContent: { paddingBottom: 50, paddingTop: 20 },
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
  deletedAccountTextBlock: {
    flex: 1,
    paddingRight: 10,
  },
  deletedAccountMeta: {
    color: "#666",
    fontSize: 13,
    marginTop: 3,
  },
  deletedAccountRefs: {
    color: "#888",
    fontSize: 12,
    marginTop: 4,
  },
  iconButton: {
    padding: 8,
    borderRadius: 5,
  },
  disabledIconButton: {
    opacity: 0.5,
  },
  noData: {
    fontSize: 16,
    color: "gray",
    textAlign: "center",
    marginVertical: 10,
  },
  systemRow: {
    marginVertical: 12,
  },
});
