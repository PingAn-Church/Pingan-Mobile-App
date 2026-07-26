import React, { useEffect, useContext, useState } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Image,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { registerUser } from "../../service/AuthService";
// import { getPresignedUploadUrl } from "../../service/S3Service";  // Assuming S3Service handles URL requests
import {
  getPresignedUploadUrl,
  uploadFileToOSS,
} from "../../service/OSSService";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { showAlert } from "../../utils/showAlert"
import GuestContinueLink from "../../components/GuestContinueLink";
import AuthSwitchLink from "../../components/AuthSwitchLink";
import TermsModal, { TERMS_COPY } from "../../components/TermsAndConditions";

export default function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profileImage, setProfileImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);

  const navigation = useNavigation(); // React Navigation
  const { language } = useContext(LanguageContext);
  const termsCopy = TERMS_COPY[language] || TERMS_COPY.en;

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("register"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  // Function to pick an image from the gallery
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
      setUploading(true);

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
      console.log("Presigned URL:", presignedUploadUrl);

      // Step 2: Upload image to OSS
      const uploadedFileUrl = await uploadFileToOSS(
        profileImage,
        presignedUploadUrl
      );

      setUploading(false);
      showAlert(i18n.t("success"), i18n.t("imageUploadSuccess"), [
        { text: i18n.t("ok") },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return uploadedFileUrl; // ✅ Return the uploaded file URL
    } catch (error) {
      console.error("Error uploading image:", error);
      setUploading(false);
      showAlert(i18n.t("error"), i18n.t("imageUploadFailed"), [
        { text: i18n.t("ok") },
      ]);
      return null;
    }
  };

  const openTerms = () => {
    Keyboard.dismiss();
    setTermsVisible(true);
  };

  const handleRegister = async () => {
    if (submitting) return; // ignore repeat taps while registering
    if (!termsAccepted) {
      showAlert(i18n.t("error"), termsCopy.mustAccept, [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    if (!firstName || !lastName || !email || !password) {
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

    if (password.length < 8) {
      showAlert(i18n.t("error"), i18n.t("passwordCheck"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    setSubmitting(true);
    try {
      const profileImageUrl = await uploadImageUsingPresignedUrl(
        "profile",
        email
      ); // Pass the file type as 'profile'

      const user = {
        firstName,
        lastName,
        email,
        password,
        profileImage: profileImageUrl, // Include the uploaded image URL
      };

      const response = await registerUser(user);

      // No account exists yet — the sign-up is held server-side until the emailed
      // code is verified, which is when the user row is created and the push token
      // is registered (see VerificationCodePage). Just go enter the code.
      if (response.status === 200) {
        navigation.navigate("VerificationCode", { email });
      }
    } catch (error) {
      const status = error?.response?.status;
      let message;
      if (status === 403) {
        message = i18n.t("accountDeactivatedContactAdmin");
      } else if (status === 409) {
        message = i18n.t("emailAlreadyExists");
      } else {
        message = i18n.t("registerFailed");
      }
      showAlert(i18n.t("error"), message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <KeyboardAwareScrollView
        style={styles.container}
        contentContainerStyle={styles.formContent}
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

        <TextInput
          placeholder={i18n.t("firstName")}
          value={firstName}
          onChangeText={setFirstName}
          style={styles.input}
          autoCapitalize="none"
        />
        <TextInput
          placeholder={i18n.t("lastName")}
          value={lastName}
          onChangeText={setLastName}
          style={styles.input}
          autoCapitalize="none"
        />
        <TextInput
          placeholder={i18n.t("email")}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          style={styles.input}
          autoCapitalize="none"
        />
        <TextInput
          placeholder={i18n.t("password")}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          autoCapitalize="none"
        />

        <View style={styles.termsRow}>
          <TouchableOpacity
            accessibilityRole="checkbox"
            accessibilityState={{ checked: termsAccepted }}
            style={styles.checkboxButton}
            onPress={() => setTermsAccepted((accepted) => !accepted)}
          >
            <Ionicons
              name={termsAccepted ? "checkbox" : "square-outline"}
              size={23}
              color={termsAccepted ? "#007bff" : "#555"}
            />
          </TouchableOpacity>
          <Text style={styles.termsAgreeText}>
            <Text onPress={() => setTermsAccepted((accepted) => !accepted)}>
              {termsCopy.agreePrefix}
            </Text>
            <Text style={styles.termsLink} onPress={openTerms}>
              {termsCopy.linkText}
            </Text>
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, (submitting || uploading) && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={submitting || uploading}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {uploading ? i18n.t("uploading") : i18n.t("register")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        <AuthSwitchLink
          promptKey="alreadyHaveAccount"
          actionKey="loginHere"
          routeName="Login"
        />
        <GuestContinueLink />
      </KeyboardAwareScrollView>

      <TermsModal visible={termsVisible} onClose={() => setTermsVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  // Keep the form a comfortable width on tablets/desktop.
  formContent: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginBottom: 10,
    marginTop: 10,
    borderRadius: 5,
    fontSize: 18,
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginVertical: 10,
  },
  button: {
    backgroundColor: "#007bff",
    paddingVertical: 12,
    borderRadius: 5,
    alignSelf: "stretch",
    marginVertical: 10,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  buttonContainer: {
    marginTop: 8,
    marginBottom: 12,
    width: "100%",
  },
  imageText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  imageContainer: {
    marginTop: 5,
    width: "50%",
  },
  profileContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  checkboxButton: {
    paddingVertical: 6,
    paddingRight: 8,
  },
  termsAgreeText: {
    flex: 1,
    color: "#333",
    fontSize: 14,
    lineHeight: 20,
  },
  termsLink: {
    color: "#007bff",
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});

// Function to upload image to S3 using the pre-signed URL
// const uploadImageUsingPresignedUrl = async (fileType) => {
//   if (!profileImage) return null;

//   try {
//     setUploading(true);
//     const fileName = `profile_${Date.now()}.jpg`;  // Generate a unique file name

//     // Step 1: Request pre-signed URL from the backend (pass fileType like 'profile', 'group', etc.)
//     const presignedUploadUrl = await getPresignedUploadUrl(fileName, fileType);  // pass fileType here

//     // Step 2: Fetch the image as a blob and upload it using the pre-signed URL
//     const imageResponse = await fetch(profileImage);
//     const blob = await imageResponse.blob();

//     await fetch(presignedUploadUrl, {
//       method: "PUT",
//       body: blob,
//       headers: {
//         "Content-Type": "image/jpeg",  // Adjust based on the file type
//       },
//     });

//     setUploading(false);
//     showAlert("Success", "Image uploaded successfully!");

//     return presignedUploadUrl.split('?')[0]; // Return the public URL of the uploaded image

//   } catch (error) {
//     console.error("Error uploading image:", error);
//     setUploading(false);
//     showAlert("Error", "Failed to upload the image.");
//     return null;
//   }
// };

//   const uploadImageUsingPresignedUrl = async (fileType) => {
//     if (!profileImage) return null;

//     try {
//         setUploading(true);
//         const fileName = `profile_${Date.now()}.jpg`;  // Generate unique file name

//         // Step 1: Get presigned URL from Alibaba OSS (instead of S3)
//         const presignedUploadUrl = await getPresignedUploadUrl(fileName, fileType);

//         // Step 2: Fetch image as blob and upload it using the pre-signed URL
//         const imageResponse = await fetch(profileImage);
//         const blob = await imageResponse.blob();

//         const response = await fetch(presignedUploadUrl, {
//             method: "PUT",
//             body: blob,
//             headers: {
//                 "Content-Type": "image/jpeg",  // Ensure correct file type
//             },
//         });

//         if (response.ok) {
//             setUploading(false);
//             showAlert("Success", "Image uploaded successfully!");

//             return presignedUploadUrl.split('?')[0]; // Return URL without query params
//         } else {
//             throw new Error("Upload failed");
//         }

//     } catch (error) {
//         console.error("Error uploading image:", error);
//         setUploading(false);
//         showAlert("Error", "Failed to upload the image.");
//         return null;
//     }
// };

// const uploadImageUsingPresignedUrl = async (fileType) => {
//   if (!profileImage) return null;

//   try {
//       setUploading(true);
//       const fileName = `profile_${Date.now()}.jpg`;

//       // Step 1: Get presigned URL from Alibaba OSS
//       const presignedUploadUrl = await getPresignedUploadUrl(fileName, fileType);

//       console.log("Presigned URL:", presignedUploadUrl);

//       // Step 2: Fetch image as blob and upload it using the pre-signed URL
//       const imageResponse = await fetch(profileImage);
//       const blob = await imageResponse.blob();

//       const response = await fetch(presignedUploadUrl, {
//           method: "PUT",
//           body: blob,
//           headers: {
//               "Content-Type": "image/jpeg", // Ensure correct file type
//           },
//       });

//       console.log("Upload response status:", response.status);
//       console.log("Upload response headers:", response.headers);
//       console.log("Upload response body:", await response.text());

//       if (response.ok) {
//           setUploading(false);
//           showAlert("Success", "Image uploaded successfully!");
//           return presignedUploadUrl.split('?')[0]; // Return URL without query params
//       } else {
//           throw new Error(`Upload failed. Status: ${response.status}`);
//       }

//   } catch (error) {
//       console.error("Error uploading image:", error);
//       setUploading(false);
//       showAlert("Error", "Failed to upload the image.");
//       return null;
//   }
// };

// const uploadImageUsingPresignedUrl = async (fileType) => {
//   if (!profileImage) return null;

//   try {
//       setUploading(true);
//       const fileName = `profile_${Date.now()}.jpg`;

//       // Step 1: Get presigned URL from Alibaba OSS
//       const presignedUploadUrl = await getPresignedUploadUrl(fileName, fileType);
//       console.log("Presigned URL:", presignedUploadUrl);

//       // Step 2: Fetch image as blob and upload it using the pre-signed URL
//       const imageResponse = await fetch(profileImage);
//       const blob = await imageResponse.blob();

//       const response = await fetch(presignedUploadUrl, {
//           method: "PUT",
//           body: blob,
//           headers: {
//               "Content-Type": "image/jpeg",  // Ensure correct Content-Type
//               "x-oss-content-type": "image/jpeg",  // Ensures OSS recognizes this header
//               "x-oss-object-acl": "private",  // Optional: Ensure private ACL
//           },
//       });

//       console.log("Upload response status:", response.status);
//       console.log("Upload response headers:", response.headers);
//       console.log("Upload response body:", await response.text());

//       if (response.ok) {
//           setUploading(false);
//           showAlert("Success", "Image uploaded successfully!");
//           return presignedUploadUrl.split('?')[0]; // Return URL without query params
//       } else {
//           throw new Error(`Upload failed. Status: ${response.status}`);
//       }

//   } catch (error) {
//       console.error("Error uploading image:", error);
//       setUploading(false);
//       showAlert("Error", "Failed to upload the image.");
//       return null;
//   }
// };
// const uploadImageUsingPresignedUrl = async (fileType) => {
//   if (!profileImage) return null;

//   try {
//       setUploading(true);
//       const fileName = `profile_${Date.now()}.jpg`;

//       // Step 1: Get presigned URL from Alibaba OSS
//       const presignedUploadUrl = await getPresignedUploadUrl(fileName, fileType);
//       console.log("Presigned URL:", presignedUploadUrl);

//       // Step 2: Fetch image as blob and upload it using the pre-signed URL
//       const imageResponse = await fetch(profileImage);
//       const blob = await imageResponse.blob();

//       const response = await fetch(presignedUploadUrl, {
//           method: "PUT",
//           body: blob,
//           headers: {
//               "Content-Type": "image/jpeg",  // ✅ Must match the presigned URL signature
//           },
//       });

//       console.log("Upload response status:", response.status);
//       console.log("Upload response headers:", response.headers);
//       console.log("Upload response body:", await response.text());

//       if (response.ok) {
//           setUploading(false);
//           showAlert("Success", "Image uploaded successfully!");
//           return presignedUploadUrl.split('?')[0]; // ✅ Return URL without query params
//       } else {
//           throw new Error(`Upload failed. Status: ${response.status}`);
//       }

//   } catch (error) {
//       console.error("Error uploading image:", error);
//       setUploading(false);
//       showAlert("Error", "Failed to upload the image.");
//       return null;
//   }
// };

// Function to upload image to OSS using presigned URL
// const uploadImageUsingPresignedUrl = async (fileType, email) => {
//   if (!profileImage) return null;

//   try {
//     setUploading(true);
//     const fileName = `profile_${email}.jpg`;

//     // Step 1: Get presigned URL from Alibaba OSS
//     const presignedUploadUrl = await getPresignedUploadUrl(fileName, fileType);
//     console.log("Presigned URL:", presignedUploadUrl);

//     // Step 2: Upload image to OSS
//     const uploadedFileUrl = await uploadFileToOSS(profileImage, presignedUploadUrl);

//     setUploading(false);
//     showAlert("Success", "Image uploaded successfully!");
//     return uploadedFileUrl; // ✅ Return the uploaded file URL
//   } catch (error) {
//     console.error("Error uploading image:", error);
//     setUploading(false);
//     showAlert("Error", "Failed to upload the image.");
//     return null;
//   }
// };
