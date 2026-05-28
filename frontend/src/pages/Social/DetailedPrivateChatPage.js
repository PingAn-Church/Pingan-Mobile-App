import React, { useEffect, useState, useContext } from "react";
import {
  SafeAreaView,
  Text,
  View,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from "react-native";
import { getUserById } from "../../service/UserService";
import { getPresignedDownloadUrl } from "../../service/OSSService";
import defaultProfileImage from "../../../assets/user.png";
import { deleteConversationFromDatabase } from "../../service/ChatService";
import { useNavigation } from "@react-navigation/native";
import { ChatContext } from "../../context/ChatContext";
import { confirmAction } from "../../utils/confirmAction";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";

const DetailedPrivateChatPage = ({ route }) => {
  const { otherParticipantId } = route.params;
  const [participantDetails, setParticipantDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  // const [profileImageUrl, setProfileImageUrl] = useState("https://via.placeholder.com/50");

  const { conversations, setConversations } = useContext(ChatContext);
  const { language } = useContext(LanguageContext);
  const navigation = useNavigation();

  console.log("Fetching details for user:", otherParticipantId);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("detailedPrivateChat"),
    });
  }, [language]);

  // 🔹 Fetch Other Participant Details
  useEffect(() => {
    const fetchParticipantDetails = async () => {
      try {
        const userData = await getUserById(otherParticipantId);
        console.log("Fetched User Data:", userData);

        // let imageUrl = "https://via.placeholder.com/50";
        // if (userData.profileImage) {
        //   const presignedUrl = await getPresignedDownloadUrl(userData.profileImage, "profile");
        //   imageUrl = presignedUrl || imageUrl;
        // }

        // setParticipantDetails({ ...userData, profileImageUrl: imageUrl });
        let presignedUrl = null;
        if (userData?.profileImage) {
          try {
            const fileName = userData.profileImage.split("/").pop();
            presignedUrl = await getPresignedDownloadUrl(fileName, "profile");
          } catch (e) {
            console.warn("Failed to load presigned URL for profile image.");
          }
        }
        setParticipantDetails({
          ...userData,
          profileImageUrl: presignedUrl || null,
        });
      } catch (error) {
        console.error("Error fetching participant details:", error);
        Alert.alert(i18n.t("error"), i18n.t("loadParticipantFailed"), [
          { text: i18n.t("ok") },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchParticipantDetails();
  }, [otherParticipantId]);

  const handleDeletePrivateConversation = async () => {
    const confirmed = await confirmAction({
      title: i18n.t("delete"),
      message: i18n.t("deletePrivateChatConfirm"),
      confirmText: i18n.t("delete"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });

    if (!confirmed) return;

    try {
      const conv = conversations.find(
        (c) =>
          c.conversationType === "private" &&
          c.participants.includes(otherParticipantId)
      );
      if (!conv) throw new Error(i18n.t("convoNotFound"));

      await deleteConversationFromDatabase(conv.conversationId);

      // setConversations((prev) =>
      //   prev.filter((c) => c.conversationId !== conv.conversationId)
      // );

      navigation.navigate("ChatHome");
    } catch (err) {
      Alert.alert(i18n.t("error"), err.message || i18n.t("deleteChatFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007aff" />
        <Text>{i18n.t("loadingParticipantDetails")}</Text>
      </SafeAreaView>
    );
  }

  return (
    // <SafeAreaView style={styles.container}>
    //   {/* 🔹 Profile Image and Name */}
    //   <View style={styles.headerContainer}>
    //     {/* <Image source={{ uri: participantDetails.profileImageUrl }} style={styles.profileImage} /> */}
    //     <Image
    //       source={
    //         participantDetails.profileImageUrl
    //           ? { uri: participantDetails.profileImageUrl }
    //           : defaultProfileImage
    //       }
    //       style={styles.profileImage}
    //     />
    //     <Text style={styles.participantName}>
    //       {participantDetails.firstName} {participantDetails.lastName}
    //     </Text>
    //     {/* <Text style={styles.bio}>{participantDetails.bio || "No bio available."}</Text> */}
    //   </View>
    // </SafeAreaView>
    <SafeAreaView style={styles.container}>
      <View style={styles.centeredContent}>
        <Image
          source={
            participantDetails.profileImageUrl
              ? { uri: participantDetails.profileImageUrl }
              : defaultProfileImage
          }
          style={styles.profileImage}
        />
        <Text style={styles.participantName}>
          {participantDetails.firstName} {participantDetails.lastName}
        </Text>
        {participantDetails.email && (
          <Text style={styles.email}>{participantDetails.email}</Text>
        )}
        <TouchableOpacity
          onPress={handleDeletePrivateConversation}
          style={{
            backgroundColor: "#FF3B30",
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: 8,
            marginTop: 30,
          }}
        >
          <Text
            style={{ color: "#fff", fontWeight: "bold", textAlign: "center" }}
          >
            {i18n.t("deleteConvo")}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default DetailedPrivateChatPage;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centeredContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  profileImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#007aff",
  },
  participantName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
  },
  email: {
    fontSize: 16,
    color: "#666",
    marginTop: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: "#fff",
//     padding: 20,
//   },
//   loadingContainer: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   headerContainer: {
//     alignItems: "center",
//     marginBottom: 20,
//   },
//   profileImage: {
//     width: 120,
//     height: 120,
//     borderRadius: 60,
//     marginBottom: 10,
//   },
//   participantName: {
//     fontSize: 22,
//     fontWeight: "bold",
//   },
//   // bio: {
//   //   fontSize: 16,
//   //   color: "#555",
//   //   marginTop: 5,
//   //   textAlign: "center",
//   //   paddingHorizontal: 20,
//   // },
// });
