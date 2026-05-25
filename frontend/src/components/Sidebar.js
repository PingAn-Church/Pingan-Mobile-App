import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import i18n from "../../i18n";

export default function Sidebar() {
  const navigation = useNavigation();

  const menuItems = [
    { label: "Home", route: "Home" },
    { label: "Events", route: "Events" },
    { label: "Social", route: "Social" },
    { label: "Others", route: "Others" },
    { label: "Settings", route: "Settings" },
  ];

  return (
    <View style={styles.container}>
      {menuItems.map((item) => (
        <TouchableOpacity
          key={item.route}
          style={styles.item}
          onPress={() => navigation.navigate(item.route)}
        >
          <Text style={styles.text}>{i18n.t(item.label)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
    paddingTop: 40,
  },
  item: {
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  text: {
    color: "#fff",
    fontSize: 16,
  },
});
