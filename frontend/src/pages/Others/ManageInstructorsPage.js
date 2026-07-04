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
  getInstructorUsers,
  getVerifiedUsers,
  updateUserInstructorStatus,
  updateUserActiveStatus,
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

const buildRows = (sectionKey, state, emptyText) => {
  if (state.loading && state.items.length === 0) {
    return [{ __rowKey: `${sectionKey}-loading`, __loading: true }];
  }
  if (!state.loading && state.items.length === 0) {
    return [{ __rowKey: `${sectionKey}-empty`, __empty: true, emptyText }];
  }
  const rows = state.items.map((item) => ({ ...item, __rowKey: `${sectionKey}-${item.id}` }));
  if (state.hasMore || state.loading) {
    rows.push({ __rowKey: `${sectionKey}-more`, __loadMore: true, sectionKey });
  }
  return rows;
};

function SystemRow({ item }) {
  if (item.__loading || item.__loadMore) {
    return <ActivityIndicator style={styles.systemRow} color="#007bff" />;
  }
  if (item.__empty) {
    return <Text style={styles.noData}>{item.emptyText}</Text>;
  }
  return null;
}

export default function ManageInstructorsPage() {
  const { user } = useContext(UserContext);
  const [instructors, setInstructors] = useState(emptyPage);
  const [candidates, setCandidates] = useState(emptyPage);
  const [search, setSearch] = useState("");
  const { language } = useContext(LanguageContext);
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("manageInstructors"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language, navigation]);

  const loadSection = useCallback(
    async (sectionKey, page = 0, replace = false) => {
      if (!user) return;
      const term = String(search || "").trim();
      const setter = sectionKey === "instructors" ? setInstructors : setCandidates;

      setter((prev) => {
        if (!replace && (prev.loading || !prev.hasMore)) return prev;
        return { ...prev, loading: true };
      });

      try {
        const response =
          sectionKey === "instructors"
            ? await getInstructorUsers({ q: term, page, size: PAGE_SIZE })
            : await getVerifiedUsers({ q: term, page, size: PAGE_SIZE });
        const rawItems = pagedItems(response);
        const items =
          sectionKey === "candidates"
            ? rawItems.filter((u) => u.id !== user.id && u.admin === false && u.instructor !== true)
            : rawItems;
        const info = pagedInfo(response, page, items.length);

        setter((prev) => ({
          items: replace ? items : mergeUnique(prev.items, items),
          page: info.page,
          hasMore: info.hasMore,
          loading: false,
          totalCount: info.totalCount,
        }));
      } catch (error) {
        console.error("Error fetching instructors:", error);
        setter((prev) => ({ ...prev, loading: false }));
      }
    },
    [search, user]
  );

  const refreshAll = useCallback(() => {
    setInstructors(emptyPage());
    setCandidates(emptyPage());
    loadSection("instructors", 0, true);
    loadSection("candidates", 0, true);
  }, [loadSection]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(refreshAll, 250);
    return () => clearTimeout(timer);
  }, [refreshAll, user]);

  const loadMore = useCallback(
    (sectionKey) => {
      const state = sectionKey === "instructors" ? instructors : candidates;
      if (state.loading || !state.hasMore) return;
      loadSection(sectionKey, state.page + 1, false);
    },
    [instructors, candidates, loadSection]
  );

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    viewableItems.forEach(({ item }) => {
      if (item?.__loadMore) loadMoreRef.current(item.sectionKey);
    });
  }).current;

  const handleRemoveInstructor = async (userId) => {
    try {
      await updateUserInstructorStatus(userId, false);
      refreshAll();
    } catch (error) {
      console.error("Error removing instructor:", error);
      showAlert(i18n.t("error"), i18n.t("removeInstructorFailed"), [{ text: i18n.t("ok") }]);
    }
  };

  const handleAddInstructor = async (userId) => {
    try {
      await updateUserInstructorStatus(userId, true);
      refreshAll();
    } catch (error) {
      console.error("Error adding instructor:", error);
      showAlert(i18n.t("error"), i18n.t("addInstructorFailed"), [{ text: i18n.t("ok") }]);
    }
  };

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

  const sections = useMemo(
    () => [
      {
        key: "instructors",
        title: i18n.t("currentInstructors"),
        data: buildRows("instructors", instructors, i18n.t("noInstructors")),
      },
      {
        key: "candidates",
        title: i18n.t("verifiedUsers"),
        data: buildRows("candidates", candidates, i18n.t("noVerifiedUsers")),
      },
    ],
    [instructors, candidates, language]
  );

  const renderItem = ({ item, section }) => {
    if (item.__loading || item.__empty || item.__loadMore) return <SystemRow item={item} />;

    const action =
      section.key === "instructors"
        ? () => handleRemoveInstructor(item.id)
        : () => handleAddInstructor(item.id);
    const icon = section.key === "instructors" ? "person-remove" : "person-add";
    const iconColor = section.key === "instructors" ? "red" : "green";

    return (
      <View style={styles.userItem}>
        <View style={styles.userLeft}>
          {canDeactivate(item) && (
            <TouchableOpacity
              onPress={() => confirmDeactivate(item)}
              style={styles.iconButton}
              accessibilityLabel={i18n.t("deactivate")}
            >
              <Ionicons name="remove-circle" size={24} color="red" />
            </TouchableOpacity>
          )}
          <Text style={styles.userName}>
            {item.firstName} {item.lastName}
          </Text>
        </View>
        <TouchableOpacity onPress={action} style={styles.iconButton}>
          <Ionicons name={icon} size={24} color={iconColor} />
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
      ListHeaderComponent={
        <>
          <Text style={styles.header}>{i18n.t("manageInstructors")}</Text>
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
      }
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
  systemRow: {
    marginVertical: 12,
  },
});
