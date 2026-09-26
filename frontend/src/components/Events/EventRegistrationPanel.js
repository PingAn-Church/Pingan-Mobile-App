import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import i18n from "../../../i18n";
import { UserContext } from "../../context/UserContext";
import useEventRegistration, { cancelEvent, registerEvent } from "../../hooks/useEventRegistration";
import { getEventRegistrants } from "../../service/EventService";
import { confirmAction } from "../../utils/confirmAction";
import { formatRegisteredCount } from "../../utils/eventDisplay";
import { showAlert } from "../../utils/showAlert";
import CachedImage from "../CachedImage";
import UserIdentity from "../UserIdentity";
import EventRegisterButton from "./EventRegisterButton";
import defaultProfileImage from "../../../assets/user.png";

const animateLayout = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(220, "easeInEaseOut", "opacity"));

/**
 * The sign-up block on an event's page: head count, the register / cancel
 * button, and — when this viewer is allowed to see it — the registrant list,
 * which unfolds in place. Draws nothing for an event without registration.
 */
export default function EventRegistrationPanel({ eventId }) {
  const { user } = useContext(UserContext);
  const { status, loading, refresh } = useEventRegistration(eventId);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [registrants, setRegistrants] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const chevron = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;

  const enabled = !!status?.registrationEnabled;

  // A chat card may have cached this event minutes ago; the page shows it fresh.
  useEffect(() => {
    refresh(true);
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    Animated.timing(appear, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [enabled, appear]);

  const loadRegistrants = useCallback(async () => {
    setListLoading(true);
    try {
      const rows = await getEventRegistrants(eventId);
      animateLayout();
      setRegistrants(rows);
    } catch (error) {
      setRegistrants([]);
    } finally {
      setListLoading(false);
    }
  }, [eventId]);

  // The list reflects whoever just registered or cancelled.
  useEffect(() => {
    if (listOpen && status?.canViewRegistrants) loadRegistrants();
  }, [listOpen, status?.registeredCount, status?.canViewRegistrants, loadRegistrants]);

  const toggleList = () => {
    const next = !listOpen;
    Animated.timing(chevron, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: true }).start();
    animateLayout();
    setListOpen(next);
  };

  const handleRegister = async () => {
    setBusy(true);
    try {
      const { ok, status: next } = await registerEvent(eventId);
      if (!ok) {
        showAlert(
          i18n.t("error"),
          next?.closedReason === "full" ? i18n.t("registrationFull") : i18n.t("registrationClosed")
        );
      }
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("eventActionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    const confirmed = await confirmAction({
      title: i18n.t("cancelRegistration"),
      message: i18n.t("cancelRegistrationConfirm"),
      confirmText: i18n.t("cancelRegistration"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const { ok } = await cancelEvent(eventId);
      if (!ok) showAlert(i18n.t("error"), i18n.t("registrationClosed"));
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("eventActionFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !status) {
    return <ActivityIndicator style={styles.loading} color="#8E8E93" />;
  }
  if (!enabled) return null;

  const chevronRotation = chevron.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: appear,
          transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Ionicons name="people-outline" size={22} color="#0A84FF" />
        <Text style={styles.header}>{i18n.t("eventRegistration")}</Text>
        <Text style={styles.count}>{formatRegisteredCount(status)}</Text>
      </View>

      <EventRegisterButton
        status={status}
        busy={busy}
        onRegister={handleRegister}
        style={styles.button}
      />

      {status.canCancel && (
        <TouchableOpacity onPress={handleCancel} disabled={busy} style={styles.cancelLink}>
          <Text style={styles.cancelText}>{i18n.t("cancelRegistration")}</Text>
        </TouchableOpacity>
      )}

      {status.canViewRegistrants && (
        <View style={styles.listSection}>
          <Pressable onPress={toggleList} style={styles.listToggle} accessibilityRole="button">
            <Text style={styles.listToggleText}>
              {i18n.t("registrants")} ({status.registeredCount})
            </Text>
            <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
              <Ionicons name="chevron-down" size={20} color="#8E8E93" />
            </Animated.View>
          </Pressable>

          {listOpen &&
            (listLoading && !registrants ? (
              <ActivityIndicator style={styles.loading} color="#8E8E93" />
            ) : registrants?.length ? (
              registrants.map((person) => (
                <View key={person.id} style={styles.personRow}>
                  <CachedImage
                    uri={person.profileImage}
                    type="profile"
                    fallbackSource={defaultProfileImage}
                    style={styles.avatar}
                  />
                  <UserIdentity
                    user={person}
                    nameStyle={styles.personName}
                    showEmail={!!user?.admin}
                    containerStyle={styles.personIdentity}
                  />
                  {person.checkedIn && (
                    <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.empty}>{i18n.t("noRegistrants")}</Text>
            ))}
        </View>
      )}

      {!status.canViewRegistrants && status.registrantVisibility === "REGISTRANTS" && !status.registered && (
        <Text style={styles.hint}>{i18n.t("registrantsVisibleAfterRegistering")}</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  loading: {
    marginVertical: 14,
  },
  card: {
    marginTop: 22,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#F5F8FF",
    borderWidth: 1,
    borderColor: "#DCE7FB",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  header: {
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 8,
    flex: 1,
    color: "#111113",
  },
  count: {
    fontSize: 15,
    color: "#3C3C43",
  },
  button: {
    alignSelf: "stretch",
  },
  cancelLink: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cancelText: {
    color: "#FF3B30",
    fontSize: 15,
  },
  listSection: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#C7D4EE",
  },
  listToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  listToggleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111113",
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
    backgroundColor: "#E5E5EA",
  },
  personIdentity: {
    flex: 1,
  },
  personName: {
    fontSize: 16,
  },
  empty: {
    color: "#8E8E93",
    fontSize: 15,
    paddingVertical: 8,
  },
  hint: {
    marginTop: 10,
    color: "#8E8E93",
    fontSize: 14,
    textAlign: "center",
  },
});
