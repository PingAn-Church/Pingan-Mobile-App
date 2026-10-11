import React, { useContext, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { requestPasswordReset, confirmPasswordReset } from "../../service/AuthService";
import { LanguageContext } from "../../context/LanguageContext";
import i18n from "../../../i18n";
import { showAlert } from "../../utils/showAlert";
import { makeStyles } from "../../theme";
import { AppText, Button, Heading, PasswordField, TextField, TextLink } from "../../components/ui";

const RESEND_SECONDS = 60;

/**
 * Second step of the forgot-password flow: the code was already emailed by the
 * ForgotPassword page, so this screen only collects code + new password. Unlike
 * VerificationCodePage it does NOT auto-send on mount — it just starts the
 * resend cooldown so the button state matches the code that is already in
 * transit.
 */
export default function ResetPasswordPage() {
  const styles = useStyles();
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
      <Heading level={1} style={styles.heading}>
        {i18n.t("resetPassword")}
      </Heading>
      <AppText variant="secondary" style={styles.subtitle}>
        {i18n.t("resetCodeSubtitle")} {email}
      </AppText>

      <TextField
        variant="code"
        placeholder={i18n.t("enterVerificationCode")}
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        style={styles.field}
        autoFocus
      />
      <PasswordField
        placeholder={i18n.t("newPassword")}
        value={newPassword}
        onChangeText={setNewPassword}
        containerStyle={styles.field}
        autoCapitalize="none"
      />
      <PasswordField
        placeholder={i18n.t("confirmNewPassword")}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        containerStyle={styles.field}
        autoCapitalize="none"
      />

      <Button title={i18n.t("resetPassword")} onPress={handleConfirm} loading={submitting} />

      <TextLink onPress={resendCode} disabled={cooldown > 0} style={styles.resend}>
        {cooldown > 0
          ? i18n.t("resendIn").replace("{seconds}", String(cooldown))
          : i18n.t("resendCode")}
      </TextLink>
    </View>
  );
}

// Layout only — the look of the heading, fields, button and link comes from the
// ui components.
const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    padding: t.spacing.xl,
    justifyContent: "center",
  },
  heading: {
    marginBottom: t.spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    marginBottom: t.spacing.xl,
  },
  field: {
    marginBottom: t.spacing.lg,
  },
  resend: {
    alignSelf: "center",
    marginTop: t.spacing.md,
  },
}));
