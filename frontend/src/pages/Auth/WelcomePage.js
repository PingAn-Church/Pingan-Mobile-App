// import React from "react";
// import { Button, View, Text, SafeAreaView, StyleSheet } from "react-native";
// import { useNavigation } from "@react-navigation/native";

// export default function WelcomePage() {
//   const navigation = useNavigation(); // Use the hook to access navigation

//   return (
//     <SafeAreaView style={styles.container}>
//       <Text style={styles.title}>Welcome to Our App</Text>
//       {/* <Button title="Go to Chat" onPress={() => navigation.navigate("Chat")} /> */}
//       <View style={styles.button}>
//         <Button
//           title="Go to Register"
//           onPress={() => navigation.navigate("Register")}
//         />
//       </View>
//       <View style={styles.button}>
//         <Button
//           title="Go to Login"
//           onPress={() => navigation.navigate("Login")}
//         />
//       </View>
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//     padding: 20,
//   },
//   title: {
//     fontSize: 24,
//     marginBottom: 20,
//   },
//   button: {
//     marginVertical: 10,
//     marginTop: 20,
//   },
// });

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

//   return (
//     <SafeAreaView style={styles.container}>
//       <Text style={styles.title}>Welcome to Our App</Text>
//       <View style={styles.button}>
//         <Button title="Go to Register" onPress={() => navigation.navigate("Register")} />
//       </View>
//       <View style={styles.button}>
//         <Button title="Go to Login" onPress={() => navigation.navigate("Login")} />
//       </View>
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//     padding: 20,
//   },
//   title: {
//     fontSize: 24,
//     marginBottom: 20,
//   },
//   button: {
//     marginVertical: 10,
//     marginTop: 20,
//   },
// });

import React, { useContext, useEffect } from "react";
import {
  Button,
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { UserContext } from "../../context/UserContext";
import { useState } from "react";
import i18n from "../../../i18n";
import logo from "../../../assets/logo.jpeg";

export default function WelcomePage() {
  const navigation = useNavigation();
  const { user, loading } = useContext(UserContext);
  const [logoUrl, setLogoUrl] = useState(null);

  // automatically redirect if user is logged in
  useEffect(() => {
    if (!user) return;
    if (!loading) {
      if (user) {
        console.log("✅ User authenticated, redirecting to HomeTabs...");
        navigation.replace("HomeTabs");
      }
    }
  }, [user, loading]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Image source={logo} style={styles.circleImage} />
      <Text style={styles.title}>{i18n.t("welcome")}</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate("Register")}
        >
          <Text style={styles.buttonText}>{i18n.t("register")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate("Login")}
        >
          <Text style={styles.buttonText}>{i18n.t("login")}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  circleImage: {
    width: 160,
    height: 160,
    borderRadius: 100,
    marginBottom: 20,
    backgroundColor: "#d3d3d3",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    marginBottom: 30,
    fontWeight: "bold",
    textAlign: "center",
  },
  button: {
    backgroundColor: "#007bff",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
    alignSelf: "stretch",
    marginHorizontal: 20,
    marginVertical: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  buttonContainer: {
    marginTop: 80,
    width: "100%",
  },
});
