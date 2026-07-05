import React, { useEffect, useContext, useState } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Modal,
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
import { useNotification } from "../../context/NotificationContext";
import { showAlert } from "../../utils/showAlert"

const TERMS_COPY = {
  en: {
    title: "Terms & Conditions",
    updated: "Last updated: 4 July 2026",
    agreePrefix: "I agree with the ",
    linkText: "Terms & Conditions",
    close: "Close",
    mustAccept:
      "Please read and agree with the Terms & Conditions before registering.",
    sections: [
      {
        title: "1. About this app",
        body:
          "Ping An is a community app for Pingan Church Singapore. It helps users access church information, announcements, events, learning materials, chats, threads, and related community services. The app is not an emergency, medical, legal, financial, or professional advice service.",
      },
      {
        title: "2. Accounts and access",
        body:
          "Please provide accurate registration information and keep your password private. Some features may require email verification or administrator approval. We may suspend, deactivate, or remove accounts that violate these terms, create security risks, or disrupt the community.",
      },
      {
        title: "3. Respectful community conduct",
        body:
          "You agree not to post, send, upload, or encourage harassment, bullying, hate speech, sexually explicit or exploitative content, threats, violence, illegal activity, spam, impersonation, malware, privacy violations, or content that infringes another person's rights.",
      },
      {
        title: "4. User content and moderation",
        body:
          "You are responsible for messages, threads, replies, images, voice messages, profile information, and other content you submit. You keep ownership of your content, but grant us permission to host, store, display, transmit, and make it available to the intended app audience so the app can operate. Where reporting tools are available, users may report objectionable chat content. Administrators may review reports, remove content, restrict access, or deactivate accounts where appropriate.",
      },
      {
        title: "5. Privacy, permissions, and data",
        body:
          "The app may collect and process registration details, profile information, event and application records, check-ins, learning progress, messages, user-submitted media, device information needed for push notifications, and files you choose to upload. We use this data to provide the app, keep accounts secure, notify users, support administration, and improve reliability. We do not sell personal data. Photos, voice messages, and other files may be stored with cloud service providers and may be cached on your device for faster loading. Camera, photo library, microphone, and notification permissions are requested only when needed for app features.",
      },
      {
        title: "6. Third-party links and services",
        body:
          "The app may open church websites, maps, YouTube, Tencent Video, download links, cloud storage, email, phone, or other third-party services. Those services are controlled by their own providers and may have separate terms and privacy practices.",
      },
      {
        title: "7. Events and learning",
        body:
          "Event details, attendance, applications, and learning content may change from time to time. Participation may be subject to approval, capacity, eligibility, or administrative review. Learning materials are provided for community, educational, and spiritual growth and do not guarantee any certification unless expressly stated.",
      },
      {
        title: "8. Account deletion and retention",
        body:
          "You may delete your account at any time from the Settings page in the app, or request deletion by contacting an administrator. When an account is deleted, your personal profile data is removed or anonymized; messages, threads, and other content you shared with the community may remain visible under a \"Deleted Account\" name. Administrators may also deactivate or permanently delete accounts where allowed by app policy. Some records may be retained where reasonably needed for security, legal compliance, dispute handling, or church administration. Cached media on your device can be cleared from app settings where available.",
      },
      {
        title: "9. Availability, updates, and changes",
        body:
          "We try to keep the app available and accurate, but services may be interrupted, changed, or discontinued. Updates may be required for security or compatibility. We may update these terms from time to time; continued use of the app after changes means you accept the updated terms.",
      },
      {
        title: "10. Contact and governing law",
        body:
          "For questions, concerns, reports, or account requests, contact pinganchurchsingapore@gmail.com or an app administrator. To the extent permitted by law, these terms are governed by the laws of Singapore.",
      },
    ],
  },
  zh: {
    title: "条款与条件",
    updated: "最后更新：2026 年 7 月 4 日",
    agreePrefix: "我同意",
    linkText: "条款与条件",
    close: "关闭",
    mustAccept: "请先阅读并同意条款与条件后再注册。",
    sections: [
      {
        title: "1. 关于本 App",
        body:
          "Ping An 是新加坡平安教会的社区 App，用于提供教会信息、公告、活动、学习资料、聊天、帖子以及相关社区服务。本 App 不是紧急服务，也不提供医疗、法律、财务或其他专业建议。",
      },
      {
        title: "2. 账户与访问权限",
        body:
          "请提供准确的注册信息，并妥善保管你的密码。部分功能可能需要邮箱验证或管理员审核。若账户违反本条款、造成安全风险或干扰社区秩序，我们可能暂停、停用或移除相关账户。",
      },
      {
        title: "3. 尊重社区的使用规范",
        body:
          "你同意不会发布、发送、上传或鼓励骚扰、霸凌、仇恨言论、露骨或剥削性内容、威胁、暴力、违法活动、垃圾信息、冒充他人、恶意软件、侵犯隐私或侵犯他人权利的内容。",
      },
      {
        title: "4. 用户内容与审核",
        body:
          "你需要对自己提交的消息、帖子、回复、图片、语音消息、个人资料以及其他内容负责。你仍保留自己内容的权利，但授权我们为了运行 App 而托管、存储、展示、传输，并向相应的 App 用户展示这些内容。在 App 提供举报工具的地方，用户可以举报不当聊天内容。管理员可在适当情况下审核举报、移除内容、限制访问或停用账户。",
      },
      {
        title: "5. 隐私、权限与数据",
        body:
          "本 App 可能收集和处理注册信息、个人资料、活动和申请记录、签到记录、学习进度、消息、用户上传的媒体、推送通知所需的设备信息，以及你选择上传的文件。我们使用这些数据来提供 App 功能、保障账户安全、发送通知、支持管理工作并提升可靠性。我们不会出售个人数据。照片、语音消息和其他文件可能存储在云服务提供商处，也可能缓存在你的设备上以加快加载速度。相机、照片库、麦克风和通知权限只会在相关功能需要时请求。",
      },
      {
        title: "6. 第三方链接与服务",
        body:
          "本 App 可能打开教会网站、地图、YouTube、腾讯视频、下载链接、云存储、电子邮件、电话或其他第三方服务。这些服务由各自的提供方控制，并可能适用其自己的条款和隐私规则。",
      },
      {
        title: "7. 活动与学习内容",
        body:
          "活动详情、出席安排、申请事项和学习内容可能会不时变更。参与活动或使用部分功能可能受审核、容量、资格或管理安排限制。学习资料用于社区、教育和属灵成长，除非另有明确说明，否则不保证获得任何认证。",
      },
      {
        title: "8. 账户删除与数据保留",
        body:
          "你可以随时在 App 的设置页面删除自己的账户，也可以联系管理员申请删除。账户删除后，你的个人资料将被移除或匿名化处理；你曾发送的消息、帖子等社区共享内容可能仍会保留，并以 “Deleted Account”（已删除账户）的名义显示。管理员也可在 App 政策允许的情况下停用或永久删除账户。出于安全、法律合规、争议处理或教会管理需要，部分记录可能会被合理保留。设备上的媒体缓存可在 App 设置中清除（如该功能可用）。",
      },
      {
        title: "9. 可用性、更新与变更",
        body:
          "我们会尽力保持 App 可用且信息准确，但服务可能中断、变更或停止。出于安全或兼容性原因，可能需要安装更新。我们可能不时更新本条款；条款更新后继续使用 App 即表示你接受更新后的条款。",
      },
      {
        title: "10. 联系方式与适用法律",
        body:
          "如有问题、疑虑、举报或账户相关请求，请联系 pinganchurchsingapore@gmail.com 或 App 管理员。在法律允许的范围内，本条款受新加坡法律管辖。",
      },
    ],
  },
};

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
  const { handleRegisterPushToken } = useNotification();
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

      // Account created (unverified). Register the push token now (stored
      // inactive pre-JWT) and send the user to enter the emailed code.
      if (response.status === 200) {
        const newUser = response.data;
        if (newUser?.id) await handleRegisterPushToken(newUser.id);
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
      </KeyboardAwareScrollView>

      <Modal
        visible={termsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTermsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.termsModal}>
            <View style={styles.termsHeader}>
              <Text style={styles.termsTitle}>{termsCopy.title}</Text>
              <TouchableOpacity
                onPress={() => setTermsVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={termsCopy.close}
                style={styles.termsIconButton}
              >
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            <Text style={styles.termsUpdated}>{termsCopy.updated}</Text>

            <ScrollView
              style={styles.termsScroll}
              contentContainerStyle={styles.termsScrollContent}
            >
              {termsCopy.sections.map((section) => (
                <View key={section.title} style={styles.termsSection}>
                  <Text style={styles.termsSectionTitle}>{section.title}</Text>
                  <Text style={styles.termsSectionBody}>{section.body}</Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.termsCloseButton}
              onPress={() => setTermsVisible(false)}
            >
              <Text style={styles.termsCloseButtonText}>{termsCopy.close}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  termsModal: {
    maxHeight: "86%",
    borderRadius: 14,
    backgroundColor: "#fff",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
  },
  termsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  termsTitle: {
    flex: 1,
    color: "#111",
    fontSize: 20,
    fontWeight: "700",
    paddingRight: 12,
  },
  termsIconButton: {
    padding: 4,
  },
  termsUpdated: {
    color: "#666",
    fontSize: 12,
    marginTop: 4,
    marginBottom: 10,
  },
  termsScroll: {
    maxHeight: 480,
    // Let the terms body shrink on short screens so the header and the Close
    // button always stay inside the modal's 86% height cap (RN children default
    // to flexShrink: 0, which would otherwise clip the button).
    flexShrink: 1,
  },
  termsScrollContent: {
    paddingBottom: 8,
  },
  termsSection: {
    marginBottom: 14,
  },
  termsSectionTitle: {
    color: "#111",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  termsSectionBody: {
    color: "#333",
    fontSize: 14,
    lineHeight: 20,
  },
  termsCloseButton: {
    backgroundColor: "#007bff",
    borderRadius: 6,
    alignItems: "center",
    paddingVertical: 11,
    marginTop: 10,
  },
  termsCloseButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
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
