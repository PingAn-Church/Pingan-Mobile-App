import React, { useContext, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { requestPasswordReset, confirmPasswordReset } from "../../service/AuthService";
import { LanguageContext } from "../../context/LanguageContext";
import i18n from "../../../i18n";
import { showAlert } from "../../utils/showAlert";

const RESEND_SECONDS = 60;

/**
 * Second step of the forgot-password flow: the code was already emailed by the
 * ForgotPassword page, so this screen only collects code + new password. Unlike
 * VerificationCodePage it does NOT auto-send on mount — it just starts the
 * resend cooldown so the button state matches the code that is already in
 * transit.
 */
export default function ResetPasswordPage() {
  const navigation = useNavigation();
  const route = useRoute();
  const email = route.params?.email ?? "";
  const { language } = useContext(LanguageContext);

  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("resetPassword"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  useEffect(() => {
    if (!String(email).trim()) {
      showAlert(i18n.t("error"), i18n.t("enterValidEmail"), [
        { text: i18n.t("ok"), onPress: () => navigation.goBack() },
      ]);
      return;
    }
    startCooldown();
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

  const resendCode = async () => {
    try {
      await requestPasswordReset(email);
      startCooldown();
      showAlert(i18n.t("success"), i18n.t("resetCodeSent"), [{ text: i18n.t("ok") }]);
    } catch (error) {
      if (error.response?.status === 429) startCooldown();
      const msg = error.response?.data || i18n.t("somethingWentWrong");
      showAlert(i18n.t("error"), String(msg), [{ text: i18n.t("ok") }]);
    }
  };

  const handleConfirm = async () => {
    if (!code.trim()) {
      showAlert(i18n.t("error"), i18n.t("enterVerificationCode"), [{ text: i18n.t("ok") }]);
      return;
    }
    if (!newPassword) {
      showAlert(i18n.t("error"), i18n.t("newPassword"), [{ text: i18n.t("ok") }]);
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert(i18n.t("error"), i18n.t("passwordMatch"), [{ text: i18n.t("ok") }]);
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset(email, code.trim(), newPassword);
      showAlert(i18n.t("success"), i18n.t("passwordResetSuccess"), [
        {
          text: i18n.t("ok"),
          onPress: () =>
            navigation.reset({ index: 0, routes: [{ name: "Login" }] }),
        },
      ]);
    } catch (error) {
      const msg = error.response?.data || i18n.t("somethingWentWrong");
      showAlert(i18n.t("error"), String(msg), [{ text: i18n.t("ok") }]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{i18n.t("resetPassword")}</Text>
      <Text style={styles.subtitle}>
        {i18n.t("resetCodeSubtitle")} {email}
      </Text>

      <TextInput
        placeholder={i18n.t("enterVerificationCode")}
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        style={styles.codeInput}
        autoFocus
      />
      <TextInput
        placeholder={i18n.t("newPassword")}
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        style={styles.input}
      />
      <TextInput
        placeholder={i18n.t("confirmNewPassword")}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        style={styles.input}
      />

      <TouchableOpacity style={styles.button} onPress={handleConfirm} disabled={submitting}>
        <Text style={styles.buttonText}>
          {submitting ? i18n.t("verifying") : i18n.t("resetPassword")}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={resendCode} disabled={cooldown > 0}>
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
  codeInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 12,
    borderRadius: 5,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: "center",
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 12,
    borderRadius: 5,
    fontSize: 16,
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
