import React, { useState, useContext, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useNavigation } from "@react-navigation/native";
import { createApplication } from "../../service/ApplicationService";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { showAlert } from "../../utils/showAlert";

export default function FormApplicationPage() {
  const navigation = useNavigation();

  const [contact, setContact] = useState("");
  const [applicationType, setApplicationType] = useState("Venue Use");
  const [remarks, setRemarks] = useState("");
  const { language } = useContext(LanguageContext);

  useEffect(() => {
    navigation.setOptions({
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  const handleSubmit = async () => {
    if (!contact || !applicationType || !remarks) {
      showAlert(i18n.t("error"), i18n.t("allFieldsRequired"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    if (remarks.length > 255) {
      showAlert(i18n.t("error"), i18n.t("remarksLessThan255"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9]{8,15}$/; // Modify range if needed

    if (!emailRegex.test(contact) && !phoneRegex.test(contact)) {
      showAlert(i18n.t("error"), i18n.t("validEmailOrNumber"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    const newApplication = {
      contact,
      applicationType,
      remarks,
    };

    const response = await createApplication(newApplication);

    if (response) {
      showAlert(i18n.t("success"), i18n.t("applicationSuccess"), [
        { text: i18n.t("ok") },
      ]);
      navigation.goBack();
    } else {
      showAlert(i18n.t("error"), i18n.t("applicationFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"} // iOS uses padding, Android uses height
      style={styles.container}
    >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <Text style={styles.header}>{i18n.t("formApplication")}</Text>

          <Text style={styles.label}>{i18n.t("contact")}</Text>
          <TextInput
            placeholder={i18n.t("enterPhoneOrEmail")}
            value={contact}
            onChangeText={setContact}
            style={styles.input}
            keyboardType="email-address"
          />

          <Text style={styles.label}>{i18n.t("applicationType")}</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={applicationType}
              onValueChange={(itemValue) => setApplicationType(itemValue)}
              style={styles.picker}
              mode="dropdown"
            >
              <Picker.Item
                label={i18n.t("venueUse")}
                value={i18n.t("venueUse")}
              />
              <Picker.Item
                label={i18n.t("membership")}
                value={i18n.t("membership")}
              />
              <Picker.Item
                label={i18n.t("cooperationNego")}
                value={i18n.t("cooperationNego")}
              />
              <Picker.Item
                label={i18n.t("preMarriageCounselling")}
                value={i18n.t("preMarriageCounselling")}
              />
              <Picker.Item
                label={i18n.t("preMarriageApplication")}
                value={i18n.t("preMarriageApplication")}
              />
              <Picker.Item
                label={i18n.t("counsellingAppt")}
                value={i18n.t("counsellingAppt")}
              />
              <Picker.Item
                label={i18n.t("funeralApplication")}
                value={i18n.t("funeralApplication")}
              />
              <Picker.Item
                label={i18n.t("generalEnquiry")}
                value={i18n.t("generalEnquiry")}
              />
            </Picker>
          </View>

          <Text style={styles.label}>{i18n.t("remarks")}</Text>
          <TextInput
            placeholder={i18n.t("enterRemarks")}
            value={remarks}
            onChangeText={setRemarks}
            style={styles.remarksInput}
            multiline={true}
            numberOfLines={4}
            textAlignVertical="top"
          />
          <Text style={styles.label}>{remarks.length}/255</Text>

          <TouchableOpacity onPress={handleSubmit} style={styles.button}>
            <Text style={styles.buttonText}>{i18n.t("submitApplication")}</Text>
          </TouchableOpacity>
        </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollContainer: {
    padding: 20,
  },
  header: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    backgroundColor: "#fff",
    fontSize: 16,
  },
  remarksInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    backgroundColor: "#fff",
    padding: 10,
    fontSize: 16,
    height: 120,
    textAlignVertical: "top",
    lineHeight: 24,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    backgroundColor: "#fff",
    marginBottom: 15,
    overflow: "hidden",
  },
  button: {
    backgroundColor: "#007bff",
    padding: 15,
    borderRadius: 5,
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
