import 'dotenv/config'

export default {
    expo: {
      name: "Ping An",
      slug: "pingan-mobile-app",
      version: "0.3.7",
      // Tablets rotate freely (landscape sidebar layout); phones are locked to
      // portrait at runtime in App.js via expo-screen-orientation, and natively
      // on iPhone via the UISupportedInterfaceOrientations keys below. Keep
      // "default" so `expo prebuild` doesn't re-lock the Android manifest.
      orientation: "default",
      icon: "./assets/icon.png",
      userInterfaceStyle: "light",
      splash: {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
      ios: {
        supportsTablet: true,
        buildNumber: "307",
        infoPlist: {
          // orientation: "default" above would otherwise let prebuild write all
          // four orientations for iPhone too. Spelling them out here keeps the
          // portrait-only phone layout reproducible, so `expo prebuild --clean`
          // regenerates Info.plist instead of quietly unlocking rotation.
          UISupportedInterfaceOrientations: [
            "UIInterfaceOrientationPortrait",
            "UIInterfaceOrientationPortraitUpsideDown",
          ],
          "UISupportedInterfaceOrientations~ipad": [
            "UIInterfaceOrientationPortrait",
            "UIInterfaceOrientationPortraitUpsideDown",
            "UIInterfaceOrientationLandscapeLeft",
            "UIInterfaceOrientationLandscapeRight",
          ],
          NSPhotoLibraryUsageDescription:
            "We need access to your photo library to upload profile images.",
          NSCameraUsageDescription:
            "We need access to your camera to take profile pictures.",
          NSPhotoLibraryAddUsageDescription:
            "We need permission to save images to your photo library.",
          NSMicrophoneUsageDescription:
            "We need access to your microphone to record voice messages.",
        },
        bundleIdentifier: "org.pingan.app",
      },
      android: {
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#2CA5C4",
        },
        permissions: [
          "CAMERA",
          "READ_EXTERNAL_STORAGE",
          "WRITE_EXTERNAL_STORAGE",
          "RECORD_AUDIO",
          "MODIFY_AUDIO_SETTINGS",
        ],
        package: "org.pingan.app",
        versionCode: 307,
        googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
      },
      web: {
        favicon: "./assets/favicon.png",
      },
      newArchEnabled: true,
      // SDK 57 expects every native module to register its config plugin
      // explicitly; `expo install --fix` reports the ones missing here.
      plugins: [
        "expo-font",
        // Applies userInterfaceStyle: "light" at runtime. On Android that is only
        // a string resource, so ./plugins/withAndroidLightTheme pins the native
        // theme as well — see that file for why both are needed.
        "expo-system-ui",
        "./plugins/withAndroidLightTheme",
        "expo-audio",
        // Peer of expo-audio, installed directly so the native module resolves
        // outside Expo Go.
        "expo-asset",
        "expo-image",
        "expo-localization",
        "expo-status-bar",
        "@react-native-community/datetimepicker",
      ],
      extra: {
        BACKEND_BASE_URL: process.env.BACKEND_BASE_URL || process.env.EXPO_PUBLIC_BACKEND_BASE_URL,
        IP_ADDR: process.env.IP_ADDR,
        ENABLE_LIBRE_TRANSLATE: process.env.ENABLE_LIBRE_TRANSLATE === "true",
        DISTRIBUTION_CHANNEL: process.env.DISTRIBUTION_CHANNEL || "direct",
        ANDROID_VERSION_CODE: 307,
        eas: {
          projectId: "39be103c-2ac5-446e-abc7-506f4c087c45",
        },
      },
      owner: "pingan-church",
    },
  };
