import React, { useEffect, useState, useContext, useCallback } from "react";
import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  getAllOtherSections,
  getOtherContent,
  updateOtherContent,
  createOtherSection,
  renameOtherSection,
  deleteOtherSection,
} from "../../service/OthersService";
import { confirmAction } from "../../utils/confirmAction";
import { UserContext } from "../../context/UserContext";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { useFocusEffect } from "@react-navigation/native";
import { showAlert } from "../../utils/showAlert";


export default function OthersPage() {
  const { user } = useContext(UserContext);
  const navigation = useNavigation();
  const [sections, setSections] = useState([]);
  const { language } = useContext(LanguageContext);

  const fetchSections = async () => {
    try {
      const data = await getAllOtherSections();
      setSections(data);
    } catch (err) {
      console.error("Failed to fetch sections:", err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchSections();
    }, [])
  );

  const handleDelete = async (name) => {
    const confirmed = await confirmAction({
      title: i18n.t("delete"),
      message: i18n.t("areYouSure"),
      confirmText: i18n.t("delete"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });

    if (!confirmed) return;

    try {
      await deleteOtherSection(name);
      fetchSections();
    } catch (error) {
      console.log("error: ", error);
      showAlert(i18n.t("error"), i18n.t("deleteSectionFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {sections.map((section) => (
          <View key={section.name} style={styles.option}>
            <TouchableOpacity
              style={styles.optionContent}
              onPress={() =>
                navigation.navigate("OthersSection", { name: section.name })
              }
            >
              <Text style={styles.headerText}>{section.name}</Text>
              <View style={styles.iconRow}>
                {user?.admin ? (
                  <TouchableOpacity onPress={() => handleDelete(section.name)}>
                    <Ionicons name="trash-outline" size={25} color="red" />
                  </TouchableOpacity>
                ) : (
                  <Ionicons
                    name="chevron-forward-outline"
                    size={25}
                    color="#333"
                  />
                )}
              </View>
            </TouchableOpacity>
          </View>
        ))}

        {user?.admin && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() =>
              navigation.navigate("OthersSection", { name: "__new__" })
            }
          >
            <Ionicons name="add-circle-outline" size={24} color="#fff" />
            <Text style={styles.addText}>{i18n.t("addSection")}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export function OthersSectionPage() {
  const { user } = useContext(UserContext);
  const navigation = useNavigation();
  const route = useRoute();
  const { name: initialName } = route.params;
  const { language } = useContext(LanguageContext);

  const [originalName, setOriginalName] = useState(initialName);
  const [name, setName] = useState(
    initialName === "__new__" ? "" : initialName
  );
  const [content, setContent] = useState("");
  const [editable, setEditable] = useState(initialName === "__new__");

  useEffect(() => {
    const fetchContent = async () => {
      if (initialName === "__new__") return;
      try {
        const data = await getOtherContent(initialName);
        setContent(data.content || "");
      } catch (err) {
        console.log("Section not found (creating new)");
        setEditable(true);
      }
    };
    fetchContent();
  }, [initialName]);

  useEffect(() => {
    navigation.setOptions({
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  const handleSave = async () => {
    if (!name.trim()) {
      showAlert(i18n.t("error"), i18n.t("allFieldsRequired"), [
        { text: i18n.t("ok") },
      ]);
    }

    try {
      if (initialName === "__new__") {
        await createOtherSection(name.trim(), content);
      } else {
        if (name !== originalName) {
          await renameOtherSection(originalName, name);
        }
        await updateOtherContent(name, content);
      }

      setOriginalName(name);
      navigation.setParams({ name }); // update route
      setEditable(false);
      showAlert(i18n.t("success"), i18n.t("contentUpdateSuccess"), [
        { text: i18n.t("ok") },
      ]);
    } catch (err) {
      showAlert(i18n.t("error"), i18n.t("contentUpdateFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          {editable && user?.admin ? (
            <TextInput
              style={[styles.title, styles.editableTitle]}
              placeholder={i18n.t("sectionName")}
              value={name}
              onChangeText={setName}
            />
          ) : (
            <Text style={styles.title}>{name}</Text>
          )}
          {user?.admin && initialName !== "__new__" && (
            <TouchableOpacity onPress={() => setEditable(!editable)}>
              <Ionicons
                name={editable ? "close" : "create-outline"}
                size={25}
                color="#007AFF"
              />
            </TouchableOpacity>
          )}
        </View>

        {editable ? (
          <View>
            <TextInput
              value={content}
              onChangeText={setContent}
              multiline
              style={styles.textArea}
              placeholder={i18n.t("enterSectionContent")}
            />
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveText}>{i18n.t("save")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={styles.optionText}>{content}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: { flexGrow: 1, padding: 20, paddingBottom: 60 },
  option: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerText: { fontSize: 20, color: "#333" },
  optionText: { fontSize: 18, color: "#333", lineHeight: 26 },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    flex: 1,
    marginRight: 10,
  },
  editableTitle: {
    borderBottomWidth: 1,
    borderColor: "#ccc",
  },
  textArea: {
    height: 400,
    borderColor: "#ccc",
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    textAlignVertical: "top",
    fontSize: 18,
  },
  saveButton: {
    marginTop: 20,
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  saveText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  addButton: {
    flexDirection: "row",
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 50,
  },
  addText: {
    color: "#fff",
    fontSize: 18,
    marginLeft: 8,
    fontWeight: "bold",
  },
});
