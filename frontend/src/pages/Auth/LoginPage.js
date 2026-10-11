import React, { useState, useContext, useEffect } from "react";
import { View, Keyboard, TouchableWithoutFeedback } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { loginUser } from "../../service/AuthService";
import { useNavigation } from "@react-navigation/native";
import { UserContext } from "../../context/UserContext"; // Import the UserContext
import { requestPasswordReset } from "../../service/AuthService";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { useNotification } from "../../context/NotificationContext";
import { showAlert } from "../../utils/showAlert";
import GuestContinueLink from "../../components/GuestContinueLink";
import AuthSwitchLink from "../../components/AuthSwitchLink";
import { makeStyles } from "../../theme";
import { Button, PasswordField, TextField, TextLink } from "../../components/ui";

const LoginPage = () => {
  const styles = useStyles();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
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
    if (submitting) return; // ignore repeat taps while a request is in flight
    if (!email || !password) {
      showAlert(i18n.t("error"), i18n.t("emailPwRequired"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    setSubmitting(true);
    try {
      const response = await loginUser({ email, password });

      if (response.success) {
        // Credentials being accepted is not the same as being signed in: the
        // profile fetch swallows its own failures and leaves the user null, and
        // announcing success then navigating in that state lands on a screen the
        // AuthGuard immediately bounces back to Welcome.
        const profile = await fetchUserData();
        if (!profile) {
          showAlert(i18n.t("error"), i18n.t("somethingWentWrong"), [{ text: i18n.t("ok") }]);
          return;
        }

        // Deliberately NOT awaited. Registering a push token can put up the OS
        // notification prompt and makes two network calls, none of which decide
        // whether the login worked — awaiting it held both the success message
        // and the transition behind it for seconds, so the alert arrived after
        // the user was already using the app.
        handleLoginPushToken().catch(() => {
          // Already logged and surfaced inside the notification context.
        });

        showAlert(i18n.t("success"), i18n.t("loginSuccess"), [
          { text: i18n.t("ok") },
        ]);
        navigation.reset({
          index: 0,
          routes: [{ name: "HomeTabs", params: { screen: "Home" } }],
        });
      } else {
        // Turn the backend's rejection into a specific, actionable message:
        // 401 → wrong credentials (or a deactivated account), no response → offline.
        const status = response?.status;
        const backendMessage =
          typeof response?.error === "string" ? response.error : "";
        let messageKey = "somethingWentWrong";
        if (status == null) {
          messageKey = "networkError";
        } else if (status === 401) {
          messageKey = /deactiv/i.test(backendMessage)
            ? "accountDeactivatedContactAdmin"
            : "invalidCredentials";
        }
        showAlert(i18n.t("error"), i18n.t(messageKey), [{ text: i18n.t("ok") }]);
      }
    } catch (error) {
      // loginUser resolves on API errors, so reaching here means a later step
      // (profile fetch, push-token registration) failed after credentials were OK.
      const messageKey = error?.response ? "somethingWentWrong" : "networkError";
      showAlert(i18n.t("error"), i18n.t(messageKey), [
        { text: i18n.t("ok") },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      bottomOffset={20}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.formContainer}>
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

          <TextLink
            size="lg"
            onPress={() => navigation.navigate("ForgotPassword")}
            style={styles.forgotPassword}
          >
            {i18n.t("forgotPassword")}
          </TextLink>

          <View style={styles.buttonContainer}>
            <Button title={i18n.t("login")} onPress={handleLogin} loading={submitting} />
          </View>
          <AuthSwitchLink
            promptKey="newToUs"
            actionKey="registerHere"
            routeName="Register"
          />
          <GuestContinueLink />
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAwareScrollView>
  );
};

export function ForgotPasswordPage() {
  const styles = useStyles();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigation = useNavigation();
  const { language } = useContext(LanguageContext);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("forgotPasswordPageTitle"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  const handleForgotPassword = async () => {
    if (submitting) return; // ignore repeat taps while a request is in flight
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

    setSubmitting(true);
    try {
      // Sends the verification code; the next screen collects it with the new
      // password. Same navigation either way — an unknown email gets the same
      // journey so the form can't be used to test which addresses exist.
      await requestPasswordReset(email);
      navigation.navigate("ResetPassword", { email });
    } catch (error) {
      if (error?.response?.status === 429) {
        // Cooldown active — a code is already out for this email, so the code
        // screen is still the right place to be.
        navigation.navigate("ResetPassword", { email });
        return;
      }
      // Distinguish "couldn't reach the server" from a server-side failure.
      const messageKey = error?.response ? "somethingWentWrong" : "networkError";
      showAlert(i18n.t("error"), i18n.t(messageKey), [{ text: i18n.t("ok") }]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      bottomOffset={20}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.formContainer}>
          <TextField
            size="lg"
            placeholder={i18n.t("enterEmail")}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            style={styles.field}
          />
          <View style={styles.buttonContainer}>
            <Button
              title={i18n.t("resetPassword")}
              onPress={handleForgotPassword}
              loading={submitting}
            />
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAwareScrollView>
  );
}

// Shared by LoginPage and ForgotPasswordPage. The look of the fields, button and
// link comes from the ui components; these styles are layout only.
const FORM_MAX_WIDTH = 480; // keeps the form a comfortable width on tablets/desktop

const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    padding: t.spacing.lg,
  },
  formContainer: {
    flex: 1,
    justifyContent: "center",
    width: "100%",
    maxWidth: FORM_MAX_WIDTH,
    alignSelf: "center",
  },
  field: {
    marginBottom: t.spacing.lg,
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: t.spacing.md,
  },
  buttonContainer: {
    marginTop: t.spacing.xl,
    marginBottom: t.spacing.lg,
    width: "100%",
  },
}));

export default LoginPage;
