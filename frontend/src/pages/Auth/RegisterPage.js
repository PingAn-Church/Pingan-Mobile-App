import React, { useEffect, useContext, useState } from "react";
import {
  View,
  TextInput,
  Button,
  Alert,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  Text,
} from "react-native";
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
import { UserContext } from "../../context/UserContext";
import { useNotification } from "../../context/NotificationContext";
import { showAlert } from "../../utils/showAlert"

export default function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profileImage, setProfileImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  const navigation = useNavigation(); // React Navigation
  const { language } = useContext(LanguageContext);
  const { fetchUserData } = useContext(UserContext);
  const { handleRegisterPushToken } = useNotification();

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

  const handleRegister = async () => {
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

      // Registration logs the user in (tokens stored in registerUser), so refresh
      // the session and drop them straight into the app.
      if (response.status === 200) {
        const newUser = response.data?.user ?? response.data;
        if (newUser?.id) await handleRegisterPushToken(newUser.id);
        await fetchUserData();
        navigation.navigate("HomeTabs", { screen: "Home" });
      }
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("registerFailed"));
    }
  };

  return (
    <ScrollView style={styles.container}>
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

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.button}
          onPress={handleRegister}
          disabled={uploading}
        >
          <Text style={styles.buttonText}>
            {uploading ? i18n.t("uploading") : i18n.t("register")}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
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
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  buttonContainer: {
    marginTop: 20,
    marginBottom: 60,
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
