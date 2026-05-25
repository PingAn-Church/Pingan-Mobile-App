import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";

const Card = ({ imageSource, header, date, time }) => {
  return (
    <View style={styles.card}>
      {/* Image at the top of the card */}
      <Image source={{ uri: imageSource }} style={styles.image} />

      {/* Header */}
      <Text style={styles.header}>{header}</Text>

      {/* Date Field */}
      <Text style={styles.textField}>Date: {date}</Text>

      {/* Time Field */}
      <Text style={styles.textField}>Time: {time}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    elevation: 3, // For Android shadow
    shadowColor: "#000", // For iOS shadow
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    marginHorizontal: 10,
    padding: 10,
    width: "100%", // Adjust width as necessary
    alignSelf: "center", // Center the card
  },
  image: {
    width: "100%", // Full width of the card
    height: 150, // Fixed height for the image
    borderRadius: 10, // Match card's border radius
  },
  header: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 10,
  },
  textField: {
    fontSize: 16,
    marginTop: 5,
  },
});

export default Card;
