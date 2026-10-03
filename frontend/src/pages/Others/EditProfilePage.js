import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNavigation } from "@react-navigation/native";
import { getUserById, updateUserProfile } from "../../service/UserService";
import {
  getPresignedUploadUrl,
  uploadFileToOSS,
  deleteOwnUpload,
} from "../../service/OSSService";
import CachedImage from "../../components/CachedImage";
import i18n from "../../../i18n";
import { Ionicons } from "@expo/vector-icons";
import { LanguageContext } from "../../context/LanguageContext";
import { UserContext } from "../../context/UserContext";
import { showAlert } from "../../utils/showAlert";

// Without an explicit minimum the Android picker clamps to 0 ms (1970-01-01)
// as soon as a maximum is set, so older birthdays snapped back to 1970.
const MIN_BIRTHDAY = new Date(1900, 0, 1);

// Birthdays are stored as plain "YYYY-MM-DD". Read and write them in local time:
// going through toISOString() turned an early-morning pick in UTC+8 into the
// previous day, and new Date("YYYY-MM-DD") is UTC midnight, a day early west of UTC.
const toBirthdayString = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const birthdayToDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "");
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const EditProfile = () => {
  const navigation = useNavigation();
  const { user } = useContext(UserContext);
  const { language } = useContext(LanguageContext);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [profileImage, setProfileImage] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [originalProfileImage, setOriginalProfileImage] = useState(null); // to check if image changed

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("editProfile"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  useEffect(() => {
    if (!user?.id) return;

    const fetchUser = async () => {
      try {
        const data = await getUserById(user.id);
        setFirstName(data.firstName);
        setLastName(data.lastName);
        setEmail(data.email);
        console.log("data check: ", data);
        if (data.birthday) setBirthday(data.birthday);
        // The stored object path, not a signed URL: CachedImage below serves it
        // from the same on-device copy the rest of the app already uses. Once the
        // picker runs this holds a local file:// URI instead, which is exactly how
        // the comparison against originalProfileImage detects a new picture.
        setProfileImage(data.profileImage || null);
        setOriginalProfileImage(data.profileImage || null);
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    };

    fetchUser();
  }, [user]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const uploadImageUsingPresignedUrl = async (fileType, email) => {
    if (!profileImage) return null;

    try {
      // ✅ Sanitize email (replace `@` and `.` to prevent encoding issues)
      const sanitizedEmail = email.replace(/[^a-zA-Z0-9]/g, "_"); // Removes special characters

      // ✅ Append a timestamp to ensure uniqueness
      const timestamp = Date.now();
      const fileName = `profile_${sanitizedEmail}_${timestamp}.jpg`;

      // Step 1: Get presigned URL from Alibaba OSS
      const presignedUploadUrl = await getPresignedUploadUrl(
        fileName,
        fileType
      );
      // Step 2: Upload image to OSS
      const uploadedFileUrl = await uploadFileToOSS(
        profileImage,
        presignedUploadUrl
      );

      showAlert(i18n.t("success"), i18n.t("imageUploadSuccess"), [
        { text: i18n.t("ok") },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return uploadedFileUrl; // ✅ Return the uploaded file URL
    } catch (error) {
      console.error("Error uploading image:", error);
      showAlert(i18n.t("error"), i18n.t("imageUploadFailed"), [
        { text: i18n.t("ok") },
      ]);
      return null;
    }
  };

  const handleSave = async () => {
    if (submitting) return; // ignore repeat taps while saving
    // Email isn't editable here (the server refuses a changed one), so only the
    // fields the user can actually fill in are checked.
    if (!firstName || !lastName) {
      showAlert(i18n.t("error"), i18n.t("allFieldsRequired"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    setSubmitting(true);
    let profileImageUrl = null;
    try {
      // ensure picture changed
      if (profileImage && profileImage !== originalProfileImage) {
        // The email only names the uploaded file; fall back to the id if it didn't load.
        profileImageUrl = await uploadImageUsingPresignedUrl("profile", email || String(user.id)); // Pass the file type as 'profile'
      }

      const userData = {
        firstName,
        lastName,
        birthday,
        profileImage: profileImageUrl ?? null, // Include the uploaded image URL, null = don't update
      };

      const response = await updateUserProfile(userData);

      if (response.status === 200) {
        showAlert(i18n.t("success"), i18n.t("updateProfileSuccess"), [
          {
            text: i18n.t("ok"),
            onPress: () => navigation.goBack(),
          },
        ]);
      }
    } catch (error) {
      if (profileImageUrl) {
        try {
          await deleteOwnUpload(profileImageUrl, "profile");
        } catch (cleanupError) {
          console.warn("Failed to clean up unreferenced profile upload:", cleanupError);
        }
      }
      showAlert(i18n.t("error"), i18n.t("updateProfileFailed"), [
        { text: i18n.t("ok") },
      ]);
      console.log("error: ", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDateChange = (event, selectedDate) => {
    // Android shows a modal dialog that reports a single "set"/"dismissed" event,
    // so it's correct to close the picker as soon as we hear back.
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (event?.type === "set" && selectedDate) {
        setBirthday(toBirthdayString(selectedDate));
      }
      return;
    }

    // iOS spinner fires onChange continuously while the wheels move. Just track the
    // value and keep the picker open so the user can adjust day/month/year freely;
    // they confirm with the Done button below.
    if (selectedDate) {
      setBirthday(toBirthdayString(selectedDate));
    }
  };

  const pickerValue = birthdayToDate(birthday);

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      bottomOffset={20}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.profileContainer}>
        {profileImage ? (
          <CachedImage uri={profileImage} type="profile" style={styles.image} />
        ) : (
          <Ionicons name="person-circle" size={100} color="#6e6e6e" />
        )}

        <View style={styles.imageContainer}>
          <TouchableOpacity style={styles.button} onPress={pickImage}>
            <Text style={styles.imageText}>{i18n.t("pickProfilePicture")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.label}>{i18n.t("firstName")}</Text>
      <TextInput
        style={styles.input}
        value={firstName}
        onChangeText={setFirstName}
      />

      <Text style={styles.label}>{i18n.t("lastName")}</Text>
      <TextInput
        style={styles.input}
        value={lastName}
        onChangeText={setLastName}
      />

      <Text style={styles.label}>{i18n.t("birthday")}</Text>
      <TouchableOpacity onPress={() => setShowDatePicker(true)}>
        <Text style={styles.input}>{birthday || i18n.t("selectDate")}</Text>
      </TouchableOpacity>
      {showDatePicker &&
        (Platform.OS === "ios" ? (
          <View style={styles.iosPickerContainer}>
            <DateTimePicker
              value={pickerValue}
              mode="date"
              display="spinner"
              onChange={handleDateChange}
              minimumDate={MIN_BIRTHDAY}
              maximumDate={new Date()}
              style={styles.iosPicker}
            />
            <TouchableOpacity
              style={styles.iosPickerDoneButton}
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={styles.iosPickerDoneText}>{i18n.t("done")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display="default"
            onChange={handleDateChange}
            minimumDate={MIN_BIRTHDAY}
            maximumDate={new Date()}
          />
        ))}

      <Text style={styles.emailHint}>{i18n.t("changeEmailContactAdmin")}</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, submitting && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{i18n.t("save")}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAwareScrollView>
  );
};

export default EditProfile;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  label: {
    fontSize: 18,
    marginTop: 10,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 6,
    fontSize: 18,
    marginBottom: 10,
  },
  button: {
    backgroundColor: "#007bff",
    paddingVertical: 12,
    borderRadius: 5,
    alignSelf: "stretch",
    marginVertical: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  emailHint: {
    fontSize: 14,
    color: "#888",
    marginTop: 10,
  },
  buttonContainer: {
    marginVertical: 30,
    width: "100%",
  },
  imageContainer: {
    width: "50%",
  },
  imageText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  profileContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginVertical: 10,
  },
  iosPickerContainer: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    marginBottom: 10,
    overflow: "hidden",
  },
  iosPicker: {
    alignSelf: "stretch",
  },
  iosPickerDoneButton: {
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    width: "100%",
    alignItems: "flex-end",
  },
  iosPickerDoneText: {
    color: "#007bff",
    fontSize: 16,
    fontWeight: "600",
  },
});
