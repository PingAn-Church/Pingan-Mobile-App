import React, { useEffect, useContext, useState } from "react";
import { View, Image, TouchableOpacity, Keyboard } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { registerUser } from "../../service/AuthService";
import {
  getPresignedUploadUrl,
  uploadFileToOSS,
  deleteAnonymousUpload,
} from "../../service/OSSService";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { showAlert } from "../../utils/showAlert"
import GuestContinueLink from "../../components/GuestContinueLink";
import AuthSwitchLink from "../../components/AuthSwitchLink";
import { makeStyles, useTheme } from "../../theme";
import { AppText, Button, PasswordField, TextField } from "../../components/ui";
import TermsModal, { TERMS_COPY } from "../../components/TermsAndConditions";

export default function RegisterPage() {
  const styles = useStyles();
  const { colors, sizes } = useTheme();
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
    let profileImageUrl = null;
    try {
      profileImageUrl = await uploadImageUsingPresignedUrl(
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
      if (profileImageUrl) {
        try {
          await deleteAnonymousUpload(profileImageUrl);
        } catch (cleanupError) {
          if (cleanupError?.response?.status !== 409) {
            console.warn("Failed to clean up unreferenced registration image:", cleanupError);
          }
        }
      }
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
            <Ionicons name="person-circle" size={AVATAR_SIZE} color={colors.textSecondary} />
          )}

          <View style={styles.imageContainer}>
            <Button size="md" title={i18n.t("pickProfilePicture")} onPress={pickImage} />
          </View>
        </View>

        <TextField
          size="lg"
          placeholder={i18n.t("firstName")}
          value={firstName}
          onChangeText={setFirstName}
          style={styles.field}
          autoCapitalize="none"
        />
        <TextField
          size="lg"
          placeholder={i18n.t("lastName")}
          value={lastName}
          onChangeText={setLastName}
          style={styles.field}
          autoCapitalize="none"
        />
        <TextField
          size="lg"
          placeholder={i18n.t("email")}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          style={styles.field}
          autoCapitalize="none"
        />
        <PasswordField
          placeholder={i18n.t("password")}
          value={password}
          onChangeText={setPassword}
          containerStyle={styles.field}
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
              size={sizes.icon.lg}
              color={termsAccepted ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
          <AppText variant="secondary" color="textBody" style={styles.termsAgreeText}>
            <AppText
              variant="secondary"
              color="textBody"
              onPress={() => setTermsAccepted((accepted) => !accepted)}
            >
              {termsCopy.agreePrefix}
            </AppText>
            <AppText
              variant="link"
              size="sm"
              weight="bold"
              style={styles.termsLink}
              onPress={openTerms}
              accessibilityRole="link"
            >
              {termsCopy.linkText}
            </AppText>
          </AppText>
        </View>

        <View style={styles.buttonContainer}>
          <Button
            title={uploading ? i18n.t("uploading") : i18n.t("register")}
            onPress={handleRegister}
            loading={submitting}
            disabled={uploading}
          />
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

// Layout only — the look of fields, buttons and links comes from the ui components.
const FORM_MAX_WIDTH = 560; // keeps the form a comfortable width on tablets/desktop
const AVATAR_SIZE = 100;

const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    padding: t.spacing.lg,
  },
  formContent: {
    width: "100%",
    maxWidth: FORM_MAX_WIDTH,
    alignSelf: "center",
  },
  // Same field spacing as Login.
  field: {
    marginBottom: t.spacing.lg,
  },
  image: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: t.radius.full,
    marginVertical: t.spacing.md,
  },
  imageContainer: {
    marginTop: t.spacing.xs,
    width: "50%",
  },
  profileContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginBottom: t.spacing.lg,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: t.spacing.sm,
    marginBottom: t.spacing.xs,
  },
  checkboxButton: {
    minHeight: t.sizes.minTouchTarget,
    justifyContent: "center",
    paddingRight: t.spacing.sm,
  },
  termsAgreeText: {
    flex: 1,
  },
  termsLink: {
    textDecorationLine: "underline",
  },
  buttonContainer: {
    marginTop: t.spacing.md,
    marginBottom: t.spacing.md,
    width: "100%",
  },
}));

/* ================= Marked as unused & deprecated ================= */
/* ============ S3 is only used by mystry fyp student's project ============ */

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
