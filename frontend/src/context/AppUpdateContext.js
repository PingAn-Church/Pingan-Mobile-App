import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import i18n from "../../i18n";
import { LanguageContext } from "./LanguageContext";
import {
  evaluateAndroidRelease,
  fetchLatestAndroidRelease,
  getCurrentAndroidVersion,
  getDistributionChannel,
  getIgnoredVersionCode,
  ignoreReleaseVersion,
  isAndroidNative,
  openReleaseTarget,
  resolveDirectDownload,
} from "../service/AppUpdateService";

const FOREGROUND_CHECK_INTERVAL_MS = 60 * 1000;

const AppUpdateContext = createContext(null);

export const useAppUpdate = () => {
  const context = useContext(AppUpdateContext);
  if (!context) {
    throw new Error("useAppUpdate must be used within an AppUpdateProvider");
  }
  return context;
};

const localizedReleaseNotes = (release, language) => {
  const notes = release?.releaseNotes || {};
  return notes[language] || notes.zh || notes.en || "";
};

export const AppUpdateProvider = ({ children }) => {
  const { language } = useContext(LanguageContext);
  const [status, setStatus] = useState(isAndroidNative() ? "checking" : "latest");
  const [checking, setChecking] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [release, setRelease] = useState(null);
  const [channel, setChannel] = useState(getDistributionChannel());
  const [error, setError] = useState(null);
  const [promptVisible, setPromptVisible] = useState(false);
  const [ignoreSelected, setIgnoreSelected] = useState(false);
  const [openError, setOpenError] = useState(null);
  const [pendingDownload, setPendingDownload] = useState(null);
  const checkPromiseRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const lastForegroundCheckRef = useRef(0);

  const releaseNotes = useMemo(
    () => localizedReleaseNotes(release, language),
    [language, release]
  );

  const checkForUpdates = useCallback(
    async ({ autoPrompt = false, manual = false } = {}) => {
      if (!isAndroidNative()) {
        setStatus("latest");
        return { status: "latest", updateAvailable: false };
      }

      if (checkPromiseRef.current) return checkPromiseRef.current;

      const run = async () => {
        setChecking(true);
        setError(null);
        setOpenError(null);

        try {
          const nextChannel = getDistributionChannel();
          const current = getCurrentAndroidVersion();
          const latest = await fetchLatestAndroidRelease(nextChannel);
          const evaluation = evaluateAndroidRelease(current, latest);
          const ignoredVersionCode = await getIgnoredVersionCode();

          setChannel(nextChannel);
          setCurrentVersion(current);
          setRelease(latest);
          setStatus(evaluation.status);

          const latestVersionCode = Number(latest?.latestVersionCode || 0);
          const shouldPrompt =
            evaluation.updateAvailable &&
            (evaluation.forceUpdate ||
              manual ||
              (autoPrompt && ignoredVersionCode !== latestVersionCode));

          if (shouldPrompt) {
            setIgnoreSelected(false);
            setPromptVisible(true);
          }

          return { ...evaluation, current, release: latest };
        } catch (err) {
          setStatus("unknown");
          setError(err);
          return { status: "unknown", updateAvailable: false, error: err };
        } finally {
          setChecking(false);
          checkPromiseRef.current = null;
        }
      };

      checkPromiseRef.current = run();
      return checkPromiseRef.current;
    },
    []
  );

  useEffect(() => {
    lastForegroundCheckRef.current = Date.now();
    checkForUpdates({ autoPrompt: true });
  }, [checkForUpdates]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground = /inactive|background/.test(appStateRef.current || "");
      const shouldCheck =
        nextState === "active" &&
        wasBackground &&
        Date.now() - lastForegroundCheckRef.current > FOREGROUND_CHECK_INTERVAL_MS;

      appStateRef.current = nextState;
      if (shouldCheck) {
        lastForegroundCheckRef.current = Date.now();
        checkForUpdates({ autoPrompt: true });
      }
    });

    return () => subscription.remove();
  }, [checkForUpdates]);

  const forceUpdate = status === "unsupported";

  const dismissPrompt = useCallback(async () => {
    if (forceUpdate) return;
    if (ignoreSelected && release?.latestVersionCode) {
      await ignoreReleaseVersion(release.latestVersionCode);
    }
    setPromptVisible(false);
    setIgnoreSelected(false);
  }, [forceUpdate, ignoreSelected, release]);

  const openUpdate = useCallback(async () => {
    if (!release) return;
    // Password-gated China mirrors (e.g. Lanzou) get a confirmation that surfaces
    // the password before we leave the app. Play-store links are never gated.
    if (channel !== "play") {
      const { url, password } = resolveDirectDownload(release);
      if (url && password) {
        setOpenError(null);
        setPendingDownload({ url, password });
        return;
      }
    }
    try {
      await openReleaseTarget(release, channel);
      if (!forceUpdate) setPromptVisible(false);
    } catch (err) {
      setOpenError(err);
    }
  }, [channel, forceUpdate, release]);

  const cancelPendingDownload = useCallback(() => setPendingDownload(null), []);

  const confirmPendingDownload = useCallback(async () => {
    const dl = pendingDownload;
    if (!dl) return;
    try {
      await Linking.openURL(dl.url);
      setPendingDownload(null);
      if (!forceUpdate) setPromptVisible(false);
    } catch (err) {
      setPendingDownload(null);
      setOpenError(err);
    }
  }, [pendingDownload, forceUpdate]);

  const showUpdatePrompt = useCallback(() => {
    if (status === "available" || status === "unsupported") {
      setIgnoreSelected(false);
      setPromptVisible(true);
    }
  }, [status]);

  const value = useMemo(
    () => ({
      status,
      checking,
      currentVersion,
      release,
      channel,
      error,
      isSupportedPlatform: isAndroidNative(),
      checkForUpdates,
      showUpdatePrompt,
    }),
    [channel, checkForUpdates, checking, currentVersion, error, release, showUpdatePrompt, status]
  );

  return (
    <AppUpdateContext.Provider value={value}>
      {children}
      <Modal
        animationType="fade"
        transparent
        visible={promptVisible}
        onRequestClose={forceUpdate ? () => {} : dismissPrompt}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <View style={styles.titleRow}>
              <Ionicons
                name={forceUpdate ? "alert-circle" : "sync-circle"}
                size={28}
                color={forceUpdate ? "#D32F2F" : "#D89B00"}
              />
              <Text style={styles.title}>
                {forceUpdate ? i18n.t("appUpdateRequiredTitle") : i18n.t("appUpdateAvailableTitle")}
              </Text>
            </View>

            <Text style={styles.message}>
              {forceUpdate ? i18n.t("appUpdateRequiredMessage") : i18n.t("appUpdateAvailableMessage")}
            </Text>

            <View style={styles.versionBox}>
              <Text style={styles.versionText}>
                {i18n.t("currentVersion")}: {currentVersion?.versionName || "-"} (
                {currentVersion?.versionCode || "-"})
              </Text>
              <Text style={styles.versionText}>
                {i18n.t("latestVersion")}: {release?.latestVersionName || "-"} (
                {release?.latestVersionCode || "-"})
              </Text>
              {release?.apkSizeBytes ? (
                <Text style={styles.versionText}>
                  {i18n.t("downloadSize")}: {Math.ceil(release.apkSizeBytes / 1024 / 1024)} MB
                </Text>
              ) : null}
            </View>

            {releaseNotes ? (
              <View style={styles.notesBox}>
                <Text style={styles.notesTitle}>{i18n.t("releaseNotes")}</Text>
                <ScrollView style={styles.notesScroll}>
                  <Text style={styles.notesText}>{releaseNotes}</Text>
                </ScrollView>
              </View>
            ) : null}

            {openError ? (
              <Text style={styles.errorText}>
                {openError.message || i18n.t("appUpdateOpenFailed")}
              </Text>
            ) : null}

            {!forceUpdate ? (
              <TouchableOpacity
                style={styles.ignoreRow}
                onPress={() => setIgnoreSelected((prev) => !prev)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={ignoreSelected ? "checkbox-outline" : "square-outline"}
                  size={22}
                  color="#007AFF"
                />
                <Text style={styles.ignoreText}>{i18n.t("ignoreThisUpdate")}</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.buttonRow}>
              {!forceUpdate ? (
                <TouchableOpacity style={styles.secondaryButton} onPress={dismissPrompt}>
                  <Text style={styles.secondaryButtonText}>{i18n.t("cancel")}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.primaryButton} onPress={openUpdate}>
                <Text style={styles.primaryButtonText}>{i18n.t("updateNow")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={pendingDownload !== null}
        onRequestClose={cancelPendingDownload}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <View style={styles.titleRow}>
              <Ionicons name="lock-closed" size={26} color="#D89B00" />
              <Text style={styles.title}>{i18n.t("downloadPasswordTitle")}</Text>
            </View>

            <Text style={styles.message}>{i18n.t("downloadPasswordReason")}</Text>

            <Text style={styles.passwordText} selectable>
              {pendingDownload?.password}
            </Text>

            {openError ? (
              <Text style={styles.errorText}>
                {openError.message || i18n.t("appUpdateOpenFailed")}
              </Text>
            ) : null}

            <View style={styles.pwButtonCol}>
              <TouchableOpacity style={styles.primaryButtonBlock} onPress={confirmPendingDownload}>
                <Text style={styles.primaryButtonText}>{i18n.t("downloadPasswordProceed")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButtonBlock} onPress={cancelPendingDownload}>
                <Text style={styles.secondaryButtonText}>{i18n.t("cancel")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </AppUpdateContext.Provider>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  dialog: {
    borderRadius: 8,
    padding: 20,
    backgroundColor: "#fff",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    color: "#333",
    marginBottom: 14,
  },
  versionBox: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#F5F7FA",
    marginBottom: 12,
  },
  versionText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 4,
  },
  notesBox: {
    marginBottom: 12,
  },
  notesTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
    marginBottom: 6,
  },
  notesScroll: {
    maxHeight: 120,
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#333",
  },
  errorText: {
    color: "#D32F2F",
    fontSize: 13,
    marginBottom: 10,
  },
  ignoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  ignoreText: {
    flex: 1,
    fontSize: 14,
    color: "#333",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  primaryButton: {
    minWidth: 116,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#007AFF",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  secondaryButton: {
    minWidth: 88,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#E9EDF2",
  },
  secondaryButtonText: {
    color: "#333",
    fontWeight: "700",
  },
  passwordText: {
    fontSize: 34,
    fontWeight: "800",
    color: "#111",
    textAlign: "center",
    letterSpacing: 3,
    marginVertical: 18,
  },
  pwButtonCol: {
    marginTop: 4,
    gap: 10,
  },
  primaryButtonBlock: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#007AFF",
  },
  secondaryButtonBlock: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#E9EDF2",
  },
});
