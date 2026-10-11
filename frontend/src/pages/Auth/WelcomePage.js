// import React from "react";
// import { Button, View, Text, SafeAreaView, StyleSheet } from "react-native";
// import { useNavigation } from "@react-navigation/native";

// export default function WelcomePage() {
//   const navigation = useNavigation(); // Use the hook to access navigation

// import React, { useContext, useEffect } from "react";
// import { Button, View, Text, SafeAreaView, StyleSheet, ActivityIndicator } from "react-native";
// import { useNavigation } from "@react-navigation/native";
// import { UserContext } from "../../context/UserContext";

// export default function WelcomePage() {
//   const navigation = useNavigation();
//   const { user, loading } = useContext(UserContext);

//   // ✅ Automatically redirect if user is logged in
//   useEffect(() => {
//     if (!loading && user) {
//       navigation.replace("HomeTabs"); // Redirect to home screen
//     }
//   }, [user, loading]);

//   if (loading) {
//     return (
//       <SafeAreaView style={styles.container}>
//         <ActivityIndicator size="large" color="#007AFF" />
//       </SafeAreaView>
//     );
//   }

import React, { useContext, useEffect } from "react";
import { View, SafeAreaView, Image } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { UserContext } from "../../context/UserContext";
import { useState } from "react";
import i18n from "../../../i18n";
import logo from "../../../assets/logo.jpg";
import { makeStyles } from "../../theme";
import { Button, Heading } from "../../components/ui";

export default function WelcomePage() {
  const styles = useStyles();
  const navigation = useNavigation();
  const { user, isGuest, loading } = useContext(UserContext);
  const [logoUrl, setLogoUrl] = useState(null);

  // Redirect a signed-in user to the app once the session check resolves. The
  // App-level EntryGate overlay stays up over this transition and cross-fades
  // out to reveal HomeTabs, so the redirect happens unseen behind the splash.
  useEffect(() => {
    if (!loading && (user || isGuest)) {
      navigation.replace("HomeTabs");
    }
  }, [user, isGuest, loading]);

  if (loading) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <Image source={logo} style={styles.circleImage} />
      <Heading level={1} style={styles.title}>
        {i18n.t("welcome")}
      </Heading>

      <View style={styles.buttonContainer}>
        <Button
          title={i18n.t("register")}
          onPress={() => navigation.navigate("Register")}
          style={styles.button}
        />
        <Button
          title={i18n.t("login")}
          onPress={() => navigation.navigate("Login")}
          style={styles.button}
        />
      </View>
    </SafeAreaView>
  );
}

// Layout only. No background colour: like Login and Register, this screen uses
// the navigator's background so all three sign-in screens match.
const LOGO_SIZE = 160;
const BUTTONS_MAX_WIDTH = 480; // keeps the buttons a comfortable width on tablets/desktop
const BUTTONS_TOP_GAP = 80;

const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: t.spacing.lg,
  },
  circleImage: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: t.radius.full,
    marginBottom: t.spacing.lg,
    backgroundColor: t.colors.placeholder,
  },
  title: {
    marginBottom: t.spacing["2xl"],
    textAlign: "center",
  },
  buttonContainer: {
    marginTop: BUTTONS_TOP_GAP,
    width: "100%",
    maxWidth: BUTTONS_MAX_WIDTH,
    alignSelf: "center",
  },
  button: {
    marginHorizontal: t.spacing.lg,
    marginVertical: t.spacing.md,
    width: "auto",
  },
}));
