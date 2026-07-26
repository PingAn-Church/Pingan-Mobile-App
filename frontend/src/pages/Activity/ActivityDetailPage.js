import { showAlert } from "../../utils/showAlert";
import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  FlatList,
} from "react-native";
import { getEventById, checkInToEvent } from "../../service/EventService";
import { getUserById } from "../../service/UserService";
import { useRoute } from "@react-navigation/native";
import { UserContext } from "../../context/UserContext";
import UserIdentity from "../../components/UserIdentity";
import { Ionicons, FontAwesome } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";

export default function ActivityDetailPage() {
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
    return <Text style={styles.noText}>{i18n.t("notVerified")}</Text>;
  }

  if (loading) {
    return <Text style={styles.loading}>{i18n.t("loadingEventDetails")}</Text>;
  }

  if (!event) {
    return <Text style={styles.error}>{i18n.t("eventNotFound")}</Text>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{event.title}</Text>

      <View style={styles.infoContainer}>
        <FontAwesome name="info-circle" size={30} color="#007AFF" />
        <Text style={styles.description}>{event.description}</Text>
      </View>

      <View style={styles.infoContainer}>
        <Ionicons name="calendar-outline" size={30} color="#007AFF" />
        <Text style={styles.detail}>
          {event.date} | {event.startTime + " - " + event.endTime}
        </Text>
      </View>

      <View style={styles.infoContainer}>
        <Ionicons name="location-outline" size={30} color="#007AFF" />
        <Text style={styles.detail}>{event.location}</Text>
      </View>

      {isPastEvent || userCheckedIn ? (
        <View style={styles.infoContainer}>
          <Ionicons
            name={
              userCheckedIn
                ? "checkmark-circle-outline"
                : "close-circle-outline"
            }
            size={30}
            color={userCheckedIn ? "green" : "red"}
          />
          <Text style={styles.detail}>
            {userCheckedIn ? i18n.t("checkedIn") : i18n.t("notCheckedIn")}
          </Text>
        </View>
      ) : (
        ""
      )}

      {!canCheckIn && !isPastEvent && (
        <View style={styles.infoContainer}>
          <Ionicons name={"close-circle-outline"} size={30} color={"gray"} />
          <Text style={styles.detail}>{i18n.t("checkInNotice")}</Text>
        </View>
      )}

      <View style={styles.adminContainer}>
        {checkedInUsers.length > 0 ? (
          <>
            <Text style={styles.adminHeader}>{i18n.t("checkedInUsers")}</Text>
            <FlatList
              data={checkedInUsers}
              keyExtractor={(item) =>
                item.id?.toString() ?? Math.random().toString()
              } // Ensures a valid key
              renderItem={({ item }) => (
                <View style={styles.userContainer}>
                  <Ionicons
                    name="person-outline"
                    size={20}
                    style={styles.userIcon}
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
          <Text style={styles.noCheckedIn}>{i18n.t("noCheckedInUsers")}</Text>
        )}
      </View>

      {canCheckIn &&
        !userCheckedIn &&
        (user.id ? (
          <TouchableOpacity
            style={styles.checkInButton}
            onPress={handleCheckIn}
          >
            <Ionicons name="checkmark-circle" size={30} color="white" />
            <Text style={styles.buttonText}>{i18n.t("checkIn")}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.bottomInfo}>
            <FontAwesome name="exclamation-circle" size={30} color="red" />
            <Text style={styles.warningText}>{i18n.t("loginToCheckIn")}</Text>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, // Ensures full height
    backgroundColor: "#fff",
    padding: 20,
  },
  scrollContainer: {
    padding: 20,
  },
  loading: {
    fontSize: 18,
    textAlign: "center",
    marginTop: 20,
  },
  error: {
    fontSize: 18,
    textAlign: "center",
    marginTop: 20,
    color: "red",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  infoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    marginRight: 20,
  },
  description: {
    fontSize: 18,
    color: "#555",
    marginLeft: 10,
    lineHeight: 26,
  },
  detail: {
    fontSize: 18,
    marginLeft: 10,
  },
  warningText: {
    fontSize: 18,
    color: "red",
    marginLeft: 10,
  },
  bottomInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    backgroundColor: "#f8f8f8",
    borderTopWidth: 1,
    borderTopColor: "#ddd",
  },
  checkInButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    justifyContent: "center",
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
  },
  buttonText: {
    fontSize: 18,
    color: "white",
    marginLeft: 8,
    fontWeight: "bold",
  },
  noCheckedIn: {
    fontSize: 16,
    color: "gray",
    textAlign: "center",
    marginTop: 10,
  },
  adminContainer: {
    marginTop: 25,
    padding: 10,
    borderRadius: 10,
    paddingLeft: 5,
  },
  adminHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  userText: {
    fontSize: 18,
    paddingLeft: 10,
  },
  userContainer: {
    flexDirection: "row", // Ensures horizontal alignment
    alignItems: "center", // Align icon & text vertically in the center
    paddingVertical: 5,
  },
  noText: {
    textAlign: "center",
    fontSize: 18,
    color: "gray",
    marginTop: 20,
    marginBottom: 20,
  },
});
