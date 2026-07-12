import i18n from "../../i18n";
import { showAlert } from "./showAlert";

export const showLoginRequiredAlert = (navigation) => {
  showAlert(i18n.t("loginRequiredTitle"), i18n.t("loginRequiredMessage"), [
    { text: i18n.t("cancel"), style: "cancel" },
    { text: i18n.t("login"), onPress: () => navigation.navigate("Login") },
  ]);
};
