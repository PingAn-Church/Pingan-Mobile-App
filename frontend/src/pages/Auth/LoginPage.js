import React, { useState, useContext, useEffect } from "react";
import {
  View,
  TextInput,
  Button,
  Alert,
  StyleSheet,
  TouchableOpacity,
  Text,
} from "react-native";
import { loginUser } from "../../service/AuthService";
import { useNavigation } from "@react-navigation/native";
import { UserContext } from "../../context/UserContext"; // Import the UserContext
import { connectWebSocket } from "../../service/WebSocketService";
import { requestPasswordReset } from "../../service/AuthService";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { useNotification } from "../../context/NotificationContext";
import { showAlert } from "../../utils/showAlert"

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigation = useNavigation();
  const { fetchUserData } = useContext(UserContext); // Access the context to update user data
  const { language } = useContext(LanguageContext);
  const { handleLoginPushToken } = useNotification();

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("login"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert(i18n.t("error"), i18n.t("emailPwRequired"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    try {
      const response = await loginUser({ email, password });

      console.log("REACHEDDD!");

      if (response.success) {
        await fetchUserData(); // Refresh user data
        await handleLoginPushToken(); // Register Push Token
        // await connectWebSocket(); // ✅ Connect WebSocket after login
        showAlert(i18n.t("success"), i18n.t("loginSuccess"), [
          { text: i18n.t("ok") },
        ]);
        console.log("V2!");
        navigation.navigate("HomeTabs", { screen: "Home" });
      } else {
        showAlert(i18n.t("error"), i18n.t("somethingWentWrong"), [
          { text: i18n.t("ok") },
        ]);
      }
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("loginFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  return (
    <View style={styles.container}>
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

      <TouchableOpacity onPress={() => navigation.navigate("ForgotPassword")}>
        <Text style={styles.forgotPasswordText}>
          {i18n.t("forgotPassword")}
        </Text>
      </TouchableOpacity>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>{i18n.t("login")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const navigation = useNavigation();
  const { language } = useContext(LanguageContext);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("forgotPasswordPageTitle"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  const handleForgotPassword = async () => {
    if (!email) {
      showAlert(i18n.t("error"), i18n.t("enterEmail"), [
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

    try {
      await requestPasswordReset(email);
      showAlert(i18n.t("success"), i18n.t("sendNewPasswordToEmail"), [
        {
          text: i18n.t("ok"),
          onPress: () => setEmail(""),
        },
      ]);
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("somethingWentWrong"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholder={i18n.t("enterEmail")}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        style={styles.input}
      />
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={handleForgotPassword}>
          <Text style={styles.buttonText}>{i18n.t("resetPassword")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginBottom: 20,
    borderRadius: 5,
    fontSize: 18,
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
    marginTop: 15,
    marginBottom: 60,
    width: "100%",
  },
  forgotPasswordText: {
    color: "#007AFF",
    textAlign: "right",
    fontSize: 18,
    marginBottom: 15,
  },
});

export default LoginPage;
