import { showAlert } from "../utils/showAlert";
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
} from "react-native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

const RoundedSquare = ({
  iconName,
  iconSize = 40,
  backgroundColor = "#ddd",
  iconColor = "#000",
  size = 80,
  description = "",
  descriptionSize = 14,
  descriptionColor = "#000",
  webUrl = "", // Accept web URL as a prop
  navigationScreen = "", // Accept navigation target screen name
}) => {
  const navigation = useNavigation();

  // Function to handle the click and open the URL
  const handlePress = async () => {
    if (webUrl) {
      const supported = await Linking.canOpenURL(webUrl);
      if (supported) {
        Linking.openURL(webUrl);
      } else {
        showAlert("Error", "Sorry, this URL cannot be opened.");
      }
    } else if (navigationScreen) {
      navigation.navigate(navigationScreen);
    } else {
      showAlert("Error", "No action defined for this button.");
    }
  };

  // Calculate sizes based on the size prop
  const scaledIconSize = size * 0.5; // Scale icon size
  const scaledDescriptionSize = size * 0.15; // Scale description font size

  return (
    <TouchableOpacity style={styles.wrapper} onPress={handlePress}>
      <View
        style={[
          styles.container,
          {
            width: size,
            height: size,
            borderRadius: size / 4,
            backgroundColor,
          },
        ]}
      >
        <Icon name={iconName} size={scaledIconSize} color={iconColor} />
      </View>
      {description ? (
        <Text
          style={[
            styles.description,
            { fontSize: scaledDescriptionSize, color: descriptionColor },
          ]}
        >
          {description}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 10,
  },
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  description: {
    marginTop: 5, // Space between icon and description
    textAlign: "center",
  },
});

export default RoundedSquare;
