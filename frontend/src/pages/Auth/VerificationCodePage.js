import React, { useContext, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { sendVerificationCode, verifyCode } from "../../service/AuthService";
import { UserContext } from "../../context/UserContext";
import { LanguageContext } from "../../context/LanguageContext";
import { useNotification } from "../../context/NotificationContext";
import i18n from "../../../i18n";
import { showAlert } from "../../utils/showAlert";

const RESEND_SECONDS = 60;

export default function VerificationCodePage() {
  const navigation = useNavigation();
  const route = useRoute();
  const email = route.params?.email ?? "";
  const { fetchUserData } = useContext(UserContext);
  const { language } = useContext(LanguageContext);
  const { handleLoginPushToken } = useNotification();

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("verificationCodeTitle"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  // Send the first code automatically when the screen opens.
  useEffect(() => {
    if (!String(email).trim()) {
      // Reached without an email (e.g. bad deep link) — don't call the backend
      // with a blank address; send the user back to fix it.
      showAlert(i18n.t("error"), i18n.t("enterValidEmail"), [
        { text: i18n.t("ok"), onPress: () => navigation.goBack() },
      ]);
      return;
    }
    requestCode(true);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_SECONDS);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const requestCode = async (silent = false) => {
    try {
      await sendVerificationCode(email);
      startCooldown();
      if (!silent) {
        showAlert(i18n.t("success"), i18n.t("verificationCodeSent"), [{ text: i18n.t("ok") }]);
      }
    } catch (error) {
      // 429 = cooldown still active or daily cap reached; reflect a cooldown so
      // the resend button disables, and surface the server's message.
      if (error.response?.status === 429) startCooldown();
      const msg = error.response?.data || i18n.t("somethingWentWrong");
      showAlert(i18n.t("error"), String(msg), [{ text: i18n.t("ok") }]);
    }
  };

  const handleVerify = async () => {
    if (!code.trim()) {
      showAlert(i18n.t("error"), i18n.t("enterVerificationCode"), [{ text: i18n.t("ok") }]);
      return;
    }
    setVerifying(true);
    try {
      const result = await verifyCode(email, code.trim());
      if (result.success) {
        const profile = await fetchUserData();
        if (!profile) {
          showAlert(i18n.t("error"), i18n.t("somethingWentWrong"), [{ text: i18n.t("ok") }]);
          return;
        }
        // Not awaited — see the note in LoginPage. The OS notification prompt has
        // no business standing between finishing sign-up and reaching the app.
        handleLoginPushToken().catch(() => {});
        navigation.reset({
          index: 0,
          routes: [{ name: "HomeTabs", params: { screen: "Home" } }],
        });
      } else {
        showAlert(i18n.t("error"), String(result.error || i18n.t("invalidCode")), [{ text: i18n.t("ok") }]);
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{i18n.t("verificationCodeTitle")}</Text>
      <Text style={styles.subtitle}>
        {i18n.t("verificationCodeSubtitle")} {email}
      </Text>

      <TextInput
        placeholder={i18n.t("enterVerificationCode")}
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        style={styles.input}
        autoFocus
      />

      <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={verifying}>
        <Text style={styles.buttonText}>{verifying ? i18n.t("verifying") : i18n.t("verify")}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => requestCode(false)} disabled={cooldown > 0}>
        <Text style={[styles.resendText, cooldown > 0 && styles.resendDisabled]}>
          {cooldown > 0
            ? i18n.t("resendIn").replace("{seconds}", String(cooldown))
            : i18n.t("resendCode")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  heading: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginBottom: 28,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 12,
    borderRadius: 5,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: "center",
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#007bff",
    paddingVertical: 14,
    borderRadius: 5,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  resendText: {
    color: "#007AFF",
    textAlign: "center",
    fontSize: 16,
    marginTop: 20,
  },
  resendDisabled: {
    color: "#aaa",
  },
});
