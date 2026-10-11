import { showAlert } from "../../utils/showAlert";
import React, { useContext, useEffect, useState } from "react";
import { View, FlatList } from "react-native";
import { getEventById, checkInToEvent } from "../../service/EventService";
import { getUserById } from "../../service/UserService";
import { useRoute } from "@react-navigation/native";
import { UserContext } from "../../context/UserContext";
import UserIdentity from "../../components/UserIdentity";
import { Ionicons, FontAwesome } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { makeStyles, useTheme } from "../../theme";
import { AppText, Button, Heading } from "../../components/ui";

export default function ActivityDetailPage() {
  const styles = useStyles();
  const { colors, sizes } = useTheme();
  const route = useRoute();
  const { eventId } = route.params;
  const [event, setEvent] = useState(null);
  const { user } = useContext(UserContext);
  const [loading, setLoading] = useState(true);
  const [checkedInUsers, setCheckedInUsers] = useState([]);
  const navigation = useNavigation();
  const { language } = useContext(LanguageContext);

  useEffect(() => {
    if (!user) return;
    console.log("user id:", user.id ? user.id : "null");

    navigation.setOptions({
      headerBackTitle: i18n.t("back"),
    });

    const fetchEventDetails = async () => {
      const data = await getEventById(eventId);
      console.log("event: ", data);
      setEvent(data);
      setLoading(false);
    };

    fetchEventDetails();
  }, [eventId, user, language]);

  const convertToDateTime = (dateString, timeString) => {
    if (!dateString || !timeString) return NaN;

    // Ensure timeString is in the format "HH:MM AM/PM"
    timeString = timeString.replace(/\u202F/g, " ").trim(); // Fix non-breaking spaces

    // Parse time correctly
    const timeRegex = /^(\d{1,2}):(\d{2})\s?(AM|PM)$/;
    const match = timeString.match(timeRegex);

    if (!match) {
      console.warn("Invalid time format:", timeString);
      return NaN;
    }

    let [, hours, minutes, modifier] = match;
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10);

    if (modifier === "PM" && hours !== 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;

    // Create a new Date object with the correct time
    const eventDateTime = new Date(dateString);
    eventDateTime.setHours(hours, minutes, 0, 0);

    return eventDateTime;
  };

  const today = new Date();
  const eventStartTime =
    event && event.date && event.startTime
      ? convertToDateTime(event.date, event.startTime)
      : null;
  const eventEndTime =
    event && event.date && event.endTime
      ? convertToDateTime(event.date, event.endTime)
      : null;

  const canCheckIn =
    eventStartTime &&
    eventEndTime &&
    today >= new Date(eventStartTime.getTime() - 60 * 60 * 1000) && // 1 hour before start
    today <= new Date(eventEndTime.getTime() + 60 * 60 * 1000); // 1 hour after end

  const isPastEvent =
    eventEndTime && today > new Date(eventEndTime.getTime() + 60 * 60 * 1000); // more than 1 hour after end

  const checkedInList = event?.checkedInUserIds ? event.checkedInUserIds : [];

  useEffect(() => {
    if (!user) return;
    if (checkedInList.length === 0) {
      return;
    }

    const fetchCheckedInUsers = async () => {
      try {
        const usersData = await Promise.all(
          checkedInList.map(async (userId) => {
            try {
              const userData = await getUserById(userId);
              console.log("check: ", userData);
              return userData;
            } catch (error) {
              console.error(`Error fetching user ${userId}:`, error);
              return null; // Skip failed fetches
            }
          })
        );

        setCheckedInUsers(usersData.filter((user) => user !== null)); // Remove failed fetches
        console.log("users: ", usersData);
      } catch (error) {
        console.error("Error fetching checked-in users:", error);
      }
    };

    fetchCheckedInUsers();
  }, [checkedInList]);

  const userCheckedIn = checkedInList.some(
    (userId) => Number(userId) === Number(user?.id)
  );

  const handleCheckIn = async () => {
    if (!user.id) {
      showAlert(i18n.t("error"), i18n.t("mustBeLoggedInToCheckIn"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    const response = await checkInToEvent(eventId, user.id);
    if (response) {
      showAlert(i18n.t("success"), i18n.t("checkInSuccess"), [
        { text: i18n.t("ok") },
      ]);
      navigation.goBack();
    } else {
      showAlert(i18n.t("error"), i18n.t("checkInFail"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  if (!user || !user.verifiedUser) {
    return (
      <AppText variant="bodyLarge" color="textSecondary" style={styles.message}>
        {i18n.t("notVerified")}
      </AppText>
    );
  }

  if (loading) {
    return (
      <AppText variant="bodyLarge" style={styles.message}>
        {i18n.t("loadingEventDetails")}
      </AppText>
    );
  }

  if (!event) {
    return (
      <AppText variant="bodyLarge" color="danger" style={styles.message}>
        {i18n.t("eventNotFound")}
      </AppText>
    );
  }

  return (
    <View style={styles.container}>
      <Heading level={1} style={styles.title}>
        {event.title}
      </Heading>

      <View style={styles.infoContainer}>
        <FontAwesome name="info-circle" size={sizes.icon.xl} color={colors.primary} />
        <AppText variant="bodyLarge" style={styles.infoText}>{event.description}</AppText>
      </View>

      <View style={styles.infoContainer}>
        <Ionicons name="calendar-outline" size={sizes.icon.xl} color={colors.primary} />
        <AppText variant="bodyLarge" style={styles.infoText}>
          {event.date} | {event.startTime + " - " + event.endTime}
        </AppText>
      </View>

      <View style={styles.infoContainer}>
        <Ionicons name="location-outline" size={sizes.icon.xl} color={colors.primary} />
        <AppText variant="bodyLarge" style={styles.infoText}>{event.location}</AppText>
      </View>

      {isPastEvent || userCheckedIn ? (
        <View style={styles.infoContainer}>
          <Ionicons
            name={
              userCheckedIn
                ? "checkmark-circle-outline"
                : "close-circle-outline"
            }
            size={sizes.icon.xl}
            color={userCheckedIn ? colors.success : colors.danger}
          />
          <AppText variant="bodyLarge" style={styles.infoText}>
            {userCheckedIn ? i18n.t("checkedIn") : i18n.t("notCheckedIn")}
          </AppText>
        </View>
      ) : (
        ""
      )}

      {!canCheckIn && !isPastEvent && (
        <View style={styles.infoContainer}>
          <Ionicons name="close-circle-outline" size={sizes.icon.xl} color={colors.textSecondary} />
          <AppText variant="bodyLarge" style={styles.infoText}>{i18n.t("checkInNotice")}</AppText>
        </View>
      )}

      <View style={styles.adminContainer}>
        {checkedInUsers.length > 0 ? (
          <>
            <Heading level={2} style={styles.adminHeader}>
              {i18n.t("checkedInUsers")}
            </Heading>
            <FlatList
              data={checkedInUsers}
              keyExtractor={(item) =>
                item.id?.toString() ?? Math.random().toString()
              } // Ensures a valid key
              renderItem={({ item }) => (
                <View style={styles.userContainer}>
                  <Ionicons
                    name="person-outline"
                    size={sizes.icon.md}
                    color={colors.textPrimary}
                  />
                  <UserIdentity
                    user={item}
                    nameStyle={styles.userText}
                    showEmail={!!user?.admin}
                  />
                </View>
              )}
            />
          </>
        ) : (
          <AppText variant="body" color="textSecondary" style={styles.noCheckedIn}>
            {i18n.t("noCheckedInUsers")}
          </AppText>
        )}
      </View>

      {canCheckIn &&
        !userCheckedIn &&
        (user.id ? (
          <Button
            icon="checkmark-circle"
            title={i18n.t("checkIn")}
            onPress={handleCheckIn}
            style={styles.checkInButton}
          />
        ) : (
          <View style={styles.bottomInfo}>
            <FontAwesome name="exclamation-circle" size={sizes.icon.xl} color={colors.danger} />
            <AppText variant="bodyLarge" color="danger" style={styles.infoText}>
              {i18n.t("loginToCheckIn")}
            </AppText>
          </View>
        ))}
    </View>
  );
}

// Layout only — text, icons and the button get their look from the theme.
const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
    padding: t.spacing.lg,
  },
  message: {
    textAlign: "center",
    marginTop: t.spacing.lg,
  },
  title: {
    marginBottom: t.spacing.md,
    textAlign: "center",
  },
  infoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: t.spacing.lg,
    marginRight: t.spacing.lg,
  },
  infoText: {
    marginLeft: t.spacing.md,
  },
  bottomInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: t.spacing.md,
    backgroundColor: t.colors.surfaceSubtle,
    borderTopWidth: 1,
    borderTopColor: t.colors.borderSubtle,
  },
  // Pinned to the bottom of the screen.
  checkInButton: {
    position: "absolute",
    bottom: t.spacing["2xl"],
    left: t.spacing.lg,
    right: t.spacing.lg,
  },
  noCheckedIn: {
    textAlign: "center",
    marginTop: t.spacing.md,
  },
  adminContainer: {
    marginTop: t.spacing.xl,
    padding: t.spacing.md,
    paddingLeft: t.spacing.xs,
  },
  adminHeader: {
    marginBottom: t.spacing.md,
  },
  userText: {
    fontSize: t.typography.fontSize.lg,
    paddingLeft: t.spacing.md,
  },
  userContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: t.spacing.xs,
  },
}));
