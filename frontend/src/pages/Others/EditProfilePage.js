import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  TouchableOpacity,
  Image,
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
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
  uploadFileToOSS,
  deleteOwnUpload,
} from "../../service/OSSService";
import i18n from "../../../i18n";
import { Ionicons } from "@expo/vector-icons";
import { LanguageContext } from "../../context/LanguageContext";
import { UserContext } from "../../context/UserContext";
import { showAlert } from "../../utils/showAlert";


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
        let iconUrl = null;
        setFirstName(data.firstName);
        setLastName(data.lastName);
        setEmail(data.email);
        console.log("data check: ", data);
        if (data.birthday) setBirthday(data.birthday);
        if (data.profileImage) {
          iconUrl = await fetchViewingPresignedUrl(
            data.profileImage,
            "profile"
          );
        }
        setProfileImage(iconUrl);
        setOriginalProfileImage(iconUrl); // Save initial image for comparison
        console.log("pic check: ", profileImage);
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    };

    fetchUser();
  }, [user]);

  const fetchViewingPresignedUrl = async (imageUrl, type) => {
    try {
      const fileName = imageUrl.split("/").pop();
      const presignedUrl = await getPresignedDownloadUrl(fileName, type);
      return presignedUrl;
    } catch (error) {
      console.error(`Error getting presigned URL for ${type}:`, error);
      return null;
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert(i18n.t("error"), i18n.t("needPhotoAccess"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
        {profileImage ? (
          <Image source={{ uri: profileImage }} style={styles.image} />
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

      <Text style={styles.label}>{i18n.t("email")}</Text>
      <TextInput style={styles.input} value={email} editable={false} />

      <Text style={styles.label}>{i18n.t("birthday")}</Text>
      <TouchableOpacity onPress={() => setShowDatePicker(true)}>
        <Text style={styles.input}>{birthday || i18n.t("selectDate")}</Text>
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
            >
              <Text style={styles.iosPickerDoneText}>{i18n.t("done")}</Text>
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
