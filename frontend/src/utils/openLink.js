import { Linking } from "react-native";
import i18n from "../../i18n";
import { showAlert } from "./showAlert";

/**
 * Opens a link from a message in the phone's browser (a new tab on the web).
 * The address is exactly what the sender typed, so what the reader tapped is
 * what opens; a failure — no browser, a malformed address — is said once.
 */
export async function openLink(url) {
  try {
    await Linking.openURL(url);
  } catch (error) {
    showAlert(i18n.t("linkOpenFailed"));
  }
}
