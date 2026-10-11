import React, { useContext, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { sendVerificationCode, verifyCode } from "../../service/AuthService";
import { UserContext } from "../../context/UserContext";
import { LanguageContext } from "../../context/LanguageContext";
import { useNotification } from "../../context/NotificationContext";
import i18n from "../../../i18n";
import { showAlert } from "../../utils/showAlert";
import { makeStyles } from "../../theme";
import { AppText, Button, Heading, PasswordField, TextField, TextLink } from "../../components/ui";

const RESEND_SECONDS = 60;

export default function VerificationCodePage() {
  const styles = useStyles();
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
      <Heading level={1} style={styles.heading}>
        {i18n.t("verificationCodeTitle")}
      </Heading>
      <AppText variant="secondary" style={styles.subtitle}>
        {i18n.t("verificationCodeSubtitle")} {email}
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

      <Button title={i18n.t("verify")} onPress={handleVerify} loading={verifying} />

      <TextLink onPress={() => requestCode(false)} disabled={cooldown > 0} style={styles.resend}>
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
