import React, { useContext, useEffect, useState } from "react";
import {
  View,
  TouchableOpacity,
  Platform,
  ScrollView,
  Alert,
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
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { UserContext } from "../../context/UserContext";
import { showAlert } from "../../utils/showAlert";
import { makeStyles } from "../../theme";
import { AppText, Avatar, Button, TextField } from "../../components/ui";


const EditProfile = () => {
  const styles = useStyles();
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
        // The stored object path, not a signed URL: the Avatar below (via CachedImage) serves it
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
    if (!firstName || !lastName || !email) {
      showAlert(i18n.t("error"), i18n.t("allFieldsRequired"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(email)) {
      showAlert(i18n.t("error"), i18n.t("enterValidEmail"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    setSubmitting(true);
    let profileImageUrl = null;
    try {
      // ensure picture changed
      if (profileImage && profileImage !== originalProfileImage) {
        profileImageUrl = await uploadImageUsingPresignedUrl("profile", email); // Pass the file type as 'profile'
      }

      const userData = {
        firstName,
        lastName,
        email,
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
        setBirthday(selectedDate.toISOString().split("T")[0]);
      }
      return;
    }

    // iOS spinner fires onChange continuously while the wheels move. Just track the
    // value and keep the picker open so the user can adjust day/month/year freely;
    // they confirm with the Done button below.
    if (selectedDate) {
      setBirthday(selectedDate.toISOString().split("T")[0]);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      bottomOffset={20}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.profileContainer}>
        <Avatar uri={profileImage} size="2xl" style={styles.image} />

        <View style={styles.imageContainer}>
          <Button
            title={i18n.t("pickProfilePicture")}
            size="md"
            onPress={pickImage}
            style={styles.button}
          />
        </View>
      </View>

      <AppText variant="secondary" size="lg" style={styles.label}>
        {i18n.t("firstName")}
      </AppText>
      <TextField
        size="lg"
        style={styles.input}
        value={firstName}
        onChangeText={setFirstName}
        accessibilityLabel={i18n.t("firstName")}
      />

      <AppText variant="secondary" size="lg" style={styles.label}>
        {i18n.t("lastName")}
      </AppText>
      <TextField
        size="lg"
        style={styles.input}
        value={lastName}
        onChangeText={setLastName}
        accessibilityLabel={i18n.t("lastName")}
      />

      <AppText variant="secondary" size="lg" style={styles.label}>
        {i18n.t("email")}
      </AppText>
      <TextField
        size="lg"
        style={styles.input}
        value={email}
        editable={false}
        accessibilityLabel={i18n.t("email")}
      />

      <AppText variant="secondary" size="lg" style={styles.label}>
        {i18n.t("birthday")}
      </AppText>
      <TouchableOpacity
        onPress={() => setShowDatePicker(true)}
        accessibilityRole="button"
        accessibilityLabel={`${i18n.t("birthday")}, ${birthday || i18n.t("selectDate")}`}
      >
        {/* Drawn like a TextField; "Select Date" is grey like a placeholder. */}
        <AppText
          size="lg"
          color={birthday ? "textPrimary" : "textSecondary"}
          style={[styles.input, styles.dateField]}
        >
          {birthday || i18n.t("selectDate")}
        </AppText>
      </TouchableOpacity>
      {showDatePicker &&
        (Platform.OS === "ios" ? (
          <View style={styles.iosPickerContainer}>
            <DateTimePicker
              value={birthday ? new Date(birthday) : new Date()}
              mode="date"
              display="spinner"
              onChange={handleDateChange}
              maximumDate={new Date()}
              style={styles.iosPicker}
            />
            <TouchableOpacity
              style={styles.iosPickerDoneButton}
              onPress={() => setShowDatePicker(false)}
              accessibilityRole="button"
            >
              <AppText variant="link">{i18n.t("done")}</AppText>
            </TouchableOpacity>
          </View>
        ) : (
          <DateTimePicker
            value={birthday ? new Date(birthday) : new Date()}
            mode="date"
            display="default"
            onChange={handleDateChange}
            maximumDate={new Date()}
          />
        ))}

      <View style={styles.buttonContainer}>
        <Button
          title={i18n.t("save")}
          onPress={handleSave}
          loading={submitting}
          style={styles.button}
        />
      </View>
    </KeyboardAwareScrollView>
  );
};

export default EditProfile;

const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    padding: t.spacing.lg,
  },
  label: {
    marginVertical: t.spacing.md,
  },
  input: {
    marginBottom: t.spacing.md,
  },
  dateField: {
    borderWidth: t.components.input.borderWidth,
    borderColor: t.colors.border,
    borderRadius: t.radius.control,
    padding: t.components.input.padding,
  },
  button: {
    marginVertical: t.spacing.md,
    paddingHorizontal: 0,
  },
  buttonContainer: {
    marginVertical: t.spacing["2xl"],
    width: "100%",
  },
  imageContainer: {
    width: "50%",
  },
  profileContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginBottom: t.spacing.md,
  },
  image: {
    marginVertical: t.spacing.md,
  },
  iosPickerContainer: {
    backgroundColor: t.colors.surface,
    borderWidth: t.components.input.borderWidth,
    borderColor: t.colors.border,
    borderRadius: t.radius.control,
    marginBottom: t.spacing.md,
    overflow: "hidden",
  },
  iosPicker: {
    alignSelf: "stretch",
  },
  iosPickerDoneButton: {
    alignSelf: "flex-end",
    paddingVertical: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: t.colors.borderSubtle,
    width: "100%",
    alignItems: "flex-end",
  },
}));
