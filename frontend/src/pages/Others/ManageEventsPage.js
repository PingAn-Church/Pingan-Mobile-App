import React, { useCallback, useEffect, useContext, useState, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Button,
  ScrollView,
  Switch,
  Animated,
  LayoutAnimation,
  Pressable,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} from "../../service/EventService";
import { confirmAction } from "../../utils/confirmAction";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { Platform, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { showAlert } from "../../utils/showAlert";
import { formatRegisteredCount } from "../../utils/eventDisplay";

const formatWebTimeToAMPM = (timeString) => {
  if (!timeString) return "";

  const [hours, minutes] = timeString.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

// MOVE THIS TO THE TOP, ABOVE ManageEventsPage
const convertToDateTime = (dateString, timeString) => {
  if (!dateString || !timeString) return null;

  try {
    let hours, minutes;
    const isAmPm = timeString.toUpperCase().includes("AM") || timeString.toUpperCase().includes("PM");

    if (!isAmPm) {
      const parts = timeString.split(":");
      if (parts.length !== 2) return null;
      hours = parseInt(parts[0], 10);
      minutes = parseInt(parts[1], 10);
    } else {
      const match = timeString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!match) return null;
      hours = parseInt(match[1], 10);
      minutes = parseInt(match[2], 10);
      const modifier = match[3].toUpperCase();
      if (modifier === "PM" && hours !== 12) hours += 12;
      if (modifier === "AM" && hours === 12) hours = 0;
    }

    const eventDateTime = new Date(dateString);
    if (isNaN(eventDateTime.getTime())) return null;
    eventDateTime.setHours(hours, minutes, 0, 0);
    return eventDateTime;
  } catch (e) {
    return null;
  }
};

/**
 * A row of mutually exclusive options with a highlight that slides to the
 * chosen one. The highlight's width comes from the measured row, so it adapts
 * to screen width and font scaling.
 */
function SegmentedChoice({ options, value, onChange }) {
  const [width, setWidth] = useState(0);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const position = useRef(new Animated.Value(selectedIndex)).current;

  useEffect(() => {
    Animated.spring(position, {
      toValue: selectedIndex,
      friction: 8,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [selectedIndex, position]);

  const segmentWidth = width / options.length;

  return (
    <View style={styles.segmented} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.View
          style={[
            styles.segmentHighlight,
            {
              width: segmentWidth - 4,
              transform: [
                {
                  translateX: position.interpolate({
                    inputRange: [0, Math.max(1, options.length - 1)],
                    outputRange: [2, 2 + segmentWidth * Math.max(1, options.length - 1)],
                  }),
                },
              ],
            },
          ]}
        />
      )}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={styles.segment}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]} numberOfLines={2}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ManageEventsPage() {
  const navigation = useNavigation();
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const { language } = useContext(LanguageContext);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("manageUpcomingEvents"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  const loadEvents = useCallback(async (nextPage = 0, replace = false) => {
    if (loading && !replace) return;
    setLoading(true);
    try {
      const response = await getAllEvents({
        status: "upcoming",
        page: nextPage,
        size: 20,
        sort: "startAt,asc",
      });
      const items = Array.isArray(response?.data) ? response.data : [];
      setUpcomingEvents((prev) =>
        replace ? items : [...prev, ...items.filter((event) => !prev.some((p) => p.id === event.id))]
      );
      setPage(Number.isFinite(Number(response?.pagination?.page)) ? Number(response.pagination.page) : nextPage);
      setHasMore(Boolean(response?.pagination?.hasMore));
    } catch (err) {
      console.error("Failed to load events:", err);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => loadEvents(0, true));
    return unsubscribe;
  }, [navigation, loadEvents]);

  const handleDelete = async (eventId) => {
    const confirmed = await confirmAction({
      title: i18n.t("delete"),
      message: i18n.t("areYouSure"),
      confirmText: i18n.t("delete"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });

    if (!confirmed) return;

    try {
      await deleteEvent(eventId);
      loadEvents(0, true);
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.eventItem}
      onPress={() => navigation.navigate("EventForm", { event: item })}
    >
      <View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.subtitle}>
          {item.date} | {item.startTime} - {item.endTime}
        </Text>
        <Text style={styles.subtitle}>{item.location}</Text>
        {item.registrationEnabled && (
          <Text style={styles.registrationLine}>
            {i18n.t("eventRegistration")} · {formatRegisteredCount(item)}
          </Text>
        )}
      </View>
      <TouchableOpacity onPress={() => handleDelete(item.id)}>
        <Ionicons name="trash-outline" size={24} color="red" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={upcomingEvents}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 80 }}
        onEndReached={() => {
          if (!loading && hasMore) loadEvents(page + 1, false);
        }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loading ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null}
        ListEmptyComponent={!loading ? <Text style={styles.noData}>{i18n.t("noUpcomingEvents")}</Text> : null}
      />
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => navigation.navigate("EventForm")}
      >
        <Text style={styles.buttonText}>+ {i18n.t("createEvent")}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function EventFormPage() {
  const navigation = useNavigation();
  const route = useRoute();
  const editingEvent = route.params?.event || null;

  const [eventData, setEventData] = useState({
    title: editingEvent?.title || "",
    description: editingEvent?.description || "",
    date: editingEvent?.date || "",
    startTime: editingEvent?.startTime || "",
    endTime: editingEvent?.endTime || "",
    location: editingEvent?.location || "",
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dateInputRef = useRef(null);

  // Optional sign-up. Prefilled from the list item when editing (the summary
  // carries these three), defaults off for a new event.
  const [registrationEnabled, setRegistrationEnabled] = useState(
    !!editingEvent?.registrationEnabled
  );
  const [registrationCapacity, setRegistrationCapacity] = useState(
    editingEvent?.registrationCapacity ? String(editingEvent.registrationCapacity) : ""
  );
  const [registrantVisibility, setRegistrantVisibility] = useState(
    editingEvent?.registrantVisibility || "ADMINS"
  );

  const toggleRegistration = (value) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(220, "easeInEaseOut", "opacity"));
    setRegistrationEnabled(value);
  };


  const handleDateChange = (event, selectedDate) => {
    if (event?.type === "dismissed" || !selectedDate) {
      setTimeout(() => {
        setShowDatePicker(false);
      }, 100);
      return;
    }

    setEventData((prevData) => ({
      ...prevData,
      date: selectedDate.toISOString().split("T")[0],
    }));

    setTimeout(() => {
      setShowDatePicker(false);
    }, 100);
  };

  const handleTimeChange = (field, event, selectedTime) => {
    if (event?.type === "dismissed" || !selectedTime) {
      setTimeout(() => {
        field === "startTime"
          ? setShowStartTimePicker(false)
          : setShowEndTimePicker(false);
      }, 100);
      return;
    }

    const formattedTime = selectedTime.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    if (field === "endTime") {
      setValidatedEndTime(formattedTime);
    } else {
      setEventData((prevData) => ({
        ...prevData,
        [field]: formattedTime,
      }));
    }

    setTimeout(() => {
      field === "startTime"
        ? setShowStartTimePicker(false)
        : setShowEndTimePicker(false);
    }, 100);
  };

  const handleInputChange = (field, value) => {
    setEventData({ ...eventData, [field]: value });
  };

  const convertToDateTime = (dateString, timeString) => {
    if (!dateString || !timeString) return null;

    let hours, minutes;

    // WEB FORMAT → HH:MM
    if (!timeString.toUpperCase().includes("AM") && !timeString.toUpperCase().includes("PM")) {
      const parts = timeString.split(":");

      if (parts.length !== 2) {
        console.warn("Invalid time format:", timeString);
        return null;
      }

      hours = parseInt(parts[0], 10);
      minutes = parseInt(parts[1], 10);
    }

    // MOBILE FORMAT → HH:MM AM/PM
    else {
      const match = timeString.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);

      if (!match) {
        console.warn("Invalid time format:", timeString);
        return null;
      }

      let [, h, m, modifier] = match;

      hours = parseInt(h, 10);
      minutes = parseInt(m, 10);

      if (modifier.toUpperCase() === "PM" && hours !== 12) hours += 12;
      if (modifier.toUpperCase() === "AM" && hours === 12) hours = 0;
    }

    const eventDateTime = new Date(dateString);

    if (isNaN(eventDateTime)) return null;

    eventDateTime.setHours(hours, minutes, 0, 0);

    return eventDateTime;
  };

  // End time must be after start time. If a user picks an earlier (or equal) end
  // time, warn them and snap the end time to start + 15 minutes.
  const setValidatedEndTime = (formattedEndTime) => {
    const base = eventData.date || new Date().toISOString().split("T")[0];
    const startDt = convertToDateTime(base, eventData.startTime);
    const endDt = convertToDateTime(base, formattedEndTime);

    if (startDt && endDt && endDt <= startDt) {
      const corrected = new Date(startDt.getTime() + 15 * 60 * 1000);
      const correctedStr = corrected.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      showAlert(i18n.t("error"), i18n.t("endTimeBeforeStart"), [{ text: i18n.t("ok") }]);
      setEventData((prev) => ({ ...prev, endTime: correctedStr }));
      return;
    }
    setEventData((prev) => ({ ...prev, endTime: formattedEndTime }));
  };

  const handleSubmit = async () => {
    if (submitting) return; // ignore repeat taps while saving
    const { title, description, date, startTime, endTime, location } =
      eventData;

    console.log("DATA", title, description, date, startTime, endTime, location);

    if (!title) {
      showAlert(i18n.t("error"), i18n.t("titleRequired"), [{ text: i18n.t("ok") }]);
      return;
    }

    if (!description) {
      showAlert(i18n.t("error"), i18n.t("descriptionRequired"), [{ text: i18n.t("ok") }]);
      return;
    }

    if (!date) {
      showAlert(i18n.t("error"), i18n.t("dateRequired"), [{ text: i18n.t("ok") }]);
      return;
    }

    if (!startTime) {
      showAlert(i18n.t("error"), i18n.t("startTimeRequired"), [{ text: i18n.t("ok") }]);
      return;
    }

    if (!endTime) {
      showAlert(i18n.t("error"), i18n.t("endTimeRequired"), [{ text: i18n.t("ok") }]);
      return;
    }

    if (!location) {
      showAlert(i18n.t("error"), i18n.t("locationRequired"), [{ text: i18n.t("ok") }]);
      return;
    }

    if (description.length > 255) {
      showAlert(i18n.t("error"), i18n.t("descriptionLessThan255"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    const startDateTime = convertToDateTime(date, startTime);
    const endDateTime = convertToDateTime(date, endTime);

    if (endDateTime <= startDateTime) {
      showAlert(i18n.t("error"), i18n.t("endTimeCheck"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    // Empty means unlimited, which the server takes as 0.
    const capacity = registrationCapacity ? parseInt(registrationCapacity, 10) : 0;
    if (registrationEnabled && (!Number.isFinite(capacity) || capacity < 0 || capacity > 100000)) {
      showAlert(i18n.t("error"), i18n.t("invalidCapacity"), [{ text: i18n.t("ok") }]);
      return;
    }
    const payload = {
      ...eventData,
      registrationEnabled,
      registrationCapacity: capacity,
      registrantVisibility,
    };

    setSubmitting(true);
    try {
      if (editingEvent) {
        await updateEvent(editingEvent.id, payload);
        showAlert(i18n.t("success"), i18n.t("updateEventSuccess"), [
          { text: i18n.t("ok") },
        ]);
      } else {
        await createEvent(payload);
        showAlert(i18n.t("success"), i18n.t("createEventSuccess"), [
          { text: i18n.t("ok") },
        ]);
      }
      navigation.goBack();
    } catch (error) {
      console.log("error: ", error);
      const messageKey = error?.response ? "saveEventFailed" : "networkError";
      showAlert(i18n.t("error"), i18n.t(messageKey), [{ text: i18n.t("ok") }]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      bottomOffset={20}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.header}>
        {editingEvent ? i18n.t("editEvent") : i18n.t("createEvent")}
      </Text>

      <TextInput
        style={styles.input}
        placeholder={i18n.t("title")}
        value={eventData.title}
        onChangeText={(text) => handleInputChange("title", text)}
      />

      <TextInput
        style={[styles.input, { height: 80 }]}
        multiline={true}
        numberOfLines={3}
        textAlignVertical="top"
        placeholder={i18n.t("description")}
        value={eventData.description}
        onChangeText={(text) => handleInputChange("description", text)}
      />
      <Text style={{ marginBottom: 10 }}>
        {eventData.description.length}/255
      </Text>

      {/* --- DATE SECTION --- */}
      {Platform.OS === "web" ? (
        <>
          <TouchableOpacity
            style={styles.inputRow}
            onPress={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.click()}
          >
            <Text>{eventData.date || i18n.t("selectDate")}</Text>
            <Ionicons name="calendar-outline" size={24} color="gray" />
          </TouchableOpacity>

          <input
            ref={dateInputRef}
            type="date"
            value={eventData.date}
            style={{ display: "none" }}
            onChange={(e) =>
              setEventData({ ...eventData, date: e.target.value })
            }
          />
        </>
      ) : (
        <>
          <TouchableOpacity
            style={styles.inputRow}
            onPress={() => setShowDatePicker(true)}
          >
            <Text>{eventData.date || i18n.t("selectDate")}</Text>
            <Ionicons name="calendar-outline" size={24} color="gray" />
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={eventData.date ? new Date(eventData.date) : new Date()}
              mode="date"
              display="default"
              onChange={handleDateChange}
            />
          )}
        </>
      )}
     
      {/* --- START TIME --- */}
      {Platform.OS === "web" ? (
        <input
          type="time"
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #ccc",
            marginBottom: 10,
            fontSize: 16
          }}
          onChange={(e) =>
            setEventData({
              ...eventData,
              startTime: formatWebTimeToAMPM(e.target.value),
            })
          }
        />
      ) : (
        <>
          <TouchableOpacity
            style={styles.inputRow}
            onPress={() => setShowStartTimePicker(true)}
          >
            <Text>{eventData.startTime || i18n.t("selectStartTime")}</Text>
            <Ionicons name="time-outline" size={24} color="gray" />
          </TouchableOpacity>

          {showStartTimePicker && (
            <DateTimePicker
              value={
                eventData.startTime
                  ? convertToDateTime(eventData.date, eventData.startTime)
                  : new Date()
              }
              mode="time"
              is24Hour={false}
              display="default"
              onChange={(e, time) => handleTimeChange("startTime", e, time)}
            />
          )}
        </>
      )}
      {/* --- END TIME --- */}
      {Platform.OS === "web" ? (
        <input
          type="time"
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #ccc",
            marginBottom: 10,
            fontSize: 16
          }}
          onChange={(e) => setValidatedEndTime(formatWebTimeToAMPM(e.target.value))}
        />
      ) : (
        <>
          <TouchableOpacity
            style={styles.inputRow}
            onPress={() => setShowEndTimePicker(true)}
          >
            <Text>{eventData.endTime || i18n.t("selectEndTime")}</Text>
            <Ionicons name="time-outline" size={24} color="gray" />
          </TouchableOpacity>

          {showEndTimePicker && (
            <DateTimePicker
              value={
                eventData.endTime
                  ? convertToDateTime(eventData.date, eventData.endTime)
                  : new Date()
              }
              mode="time"
              is24Hour={false}
              display="default"
              onChange={(e, time) => handleTimeChange("endTime", e, time)}
            />
          )}
        </>
      )}
      <TextInput
        style={styles.input}
        placeholder={i18n.t("location")}
        value={eventData.location}
        onChangeText={(text) => handleInputChange("location", text)}
      />

      {/* --- REGISTRATION --- */}
      <View style={styles.registrationCard}>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.sectionTitle}>{i18n.t("enableRegistration")}</Text>
            <Text style={styles.sectionHint}>{i18n.t("enableRegistrationHint")}</Text>
          </View>
          <Switch value={registrationEnabled} onValueChange={toggleRegistration} />
        </View>

        {registrationEnabled && (
          <View style={styles.registrationFields}>
            <Text style={styles.fieldLabel}>{i18n.t("registrationCapacity")}</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder={i18n.t("unlimited")}
              value={registrationCapacity}
              onChangeText={(text) => setRegistrationCapacity(text.replace(/[^0-9]/g, ""))}
              maxLength={6}
            />

            <Text style={styles.fieldLabel}>{i18n.t("registrantVisibility")}</Text>
            <SegmentedChoice
              value={registrantVisibility}
              onChange={setRegistrantVisibility}
              options={[
                { value: "ADMINS", label: i18n.t("visibilityAdmins") },
                { value: "REGISTRANTS", label: i18n.t("visibilityRegistrants") },
                { value: "EVERYONE", label: i18n.t("visibilityEveryone") },
              ]}
            />
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.submitButton, submitting && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {editingEvent ? i18n.t("updateEvent") : i18n.t("createEvent")}
          </Text>
        )}
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: "#f5f5f5" },
  header: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
  input: {
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginBottom: 10,
    borderRadius: 5,
  },
  inputRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    marginBottom: 10,
  },
  eventItem: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    elevation: 2,
  },
  title: { fontSize: 18, fontWeight: "bold" },
  subtitle: { fontSize: 16, color: "#333" },
  registrationLine: { fontSize: 14, color: "#007bff", marginTop: 4 },
  createButton: {
    backgroundColor: "#007bff",
    paddingVertical: 14,
    borderRadius: 10,
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  submitButton: {
    backgroundColor: "#007bff",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 30,
    marginBottom: 30,
  },
  registrationCard: {
    marginTop: 10,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  switchText: {
    flex: 1,
    paddingRight: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  sectionHint: {
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  registrationFields: {
    marginTop: 14,
  },
  fieldLabel: {
    fontSize: 14,
    color: "#555",
    marginBottom: 6,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: "#EEEEF0",
    borderRadius: 9,
    padding: 2,
    minHeight: 40,
  },
  segmentHighlight: {
    position: "absolute",
    top: 2,
    bottom: 2,
    left: 0,
    borderRadius: 7,
    backgroundColor: "#007bff",
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  segmentText: {
    fontSize: 14,
    color: "#333",
    textAlign: "center",
  },
  segmentTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  noData: {
    fontSize: 16,
    color: "gray",
    textAlign: "center",
    marginVertical: 20,
  },
});
