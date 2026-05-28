// import React from "react";
// import AsyncStorage from '@react-native-async-storage/async-storage';

// import { View, Text, StyleSheet } from "react-native";

// const WelcomePage = () => {
//   return (
//     <View style={styles.container}>
//       <Text style={styles.welcomeText}>Welcome to Our App!</Text>
//       <Text style={styles.infoText}>We're glad to have you here.</Text>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//     padding: 20,
//     backgroundColor: "#f5f5f5",
//   },
//   welcomeText: {
//     fontSize: 24,
//     fontWeight: "bold",
//     marginBottom: 10,
//   },
//   infoText: {
//     fontSize: 16,
//     color: "#666",
//   },
// });

// export default WelcomePage;

// import React, { useContext } from "react";
// import { View, Text, Button, StyleSheet, Alert } from "react-native";
// import { UserContext } from "../context/UserContext";
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import { useNavigation } from "@react-navigation/native";

// const WelcomePage = () => {
//   const { user, loading } = useContext(UserContext); // Access user from context
//   const navigation = useNavigation();

//   // Function to handle logout
//   const handleLogout = async () => {
//     try {
//       await AsyncStorage.removeItem("authToken"); // Remove token
//       Alert.alert("Success", "You have been logged out.");
//       navigation.navigate("Login"); // Navigate to login page
//     } catch (error) {
//       console.error("Error logging out:", error);
//     }
//   };

//   if (loading) {
//     return <Text>Loading...</Text>; // Show loading if user data is not yet available
//   }

//   return (
//     <View style={styles.container}>
//       {user ? (
//         <View>
//           <Text style={styles.welcomeText}>Welcome, {user.name}!</Text>
//           <Text style={styles.emailText}>Email: {user.email}</Text>
//           <Button title="Logout" onPress={handleLogout} />
//         </View>
//       ) : (
//         <Text style={styles.errorText}>Failed to load user information.</Text>
//       )}
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//     padding: 20,
//   },
//   welcomeText: {
//     fontSize: 24,
//     fontWeight: "bold",
//     marginBottom: 10,
//   },
//   emailText: {
//     fontSize: 18,
//     marginBottom: 20,
//   },
//   errorText: {
//     fontSize: 16,
//     color: "red",
//   },
// });

// export default WelcomePage;

import React, { useContext, useEffect, useState } from "react";
import {
  SafeAreaView,
  Text,
  Button,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Alert,
  StatusBar,
} from "react-native";
import { UserContext } from "../context/UserContext"; // Import UserContext
import { getAllUsers } from "../service/UserService"; // Assume this function fetches all users

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";

const TestPage = () => {
  const { user, loading } = useContext(UserContext); // Access user from context
  const [users, setUsers] = useState([]); // State to store all users
  const [loadingUsers, setLoadingUsers] = useState(true); // State to manage loading

  const navigation = useNavigation();

  // Function to handle logout
  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem("authToken"); // Remove token
      Alert.alert("Success", "You have been logged out.");
      navigation.navigate("Welcome"); // Navigate to Welcome page
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const allUsers = await getAllUsers(); // Fetch all users from backend
        console.log(allUsers);
        setUsers(allUsers);
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, []);

  if (loading || loadingUsers) {
    return <ActivityIndicator size="large" color="#0000ff" />; // Loading spinner
  }

  const handleChat = (selectedUser) => {
    // Navigate to ChatPage with selected user
    navigation.navigate("Chat", { user: selectedUser });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.welcomeText}>Welcome, {user.name}!</Text>
      <Text style={styles.emailText}>Email: {user.email}</Text>
      <Text style={styles.selectText}>Select a user to chat with:</Text>
      <FlatList
        data={users.filter((u) => u.id !== user.id)} // Exclude the logged-in user
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <Button
            title={`${item.firstName} ${item.lastName}`} // Display full name
            onPress={() => handleChat(item)}
          />
        )}
      />
      <Button title="Logout" onPress={handleLogout} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  emailText: {
    fontSize: 18,
    marginBottom: 20,
  },
  selectText: {
    fontSize: 18,
    marginBottom: 10,
  },
});

export default TestPage;
