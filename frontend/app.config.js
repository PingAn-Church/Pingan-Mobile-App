import 'dotenv/config'

export default {
    expo: {
      name: "Ping An",
      slug: "pingan-mobile-app",
      version: "0.1.5",
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "light",
      splash: {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
      ios: {
        supportsTablet: true,
        buildNumber: "105",
        infoPlist: {
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
        versionCode: 105,
        googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
      },
      web: {
        favicon: "./assets/favicon.png",
      },
      newArchEnabled: true,
      plugins: [
        "expo-font",
        // Enforces userInterfaceStyle: "light" on Android during prebuild, so the
        // light-only theme survives `expo prebuild --clean` (see styles.xml).
        "expo-system-ui",
      ],
      extra: {
        BACKEND_BASE_URL: process.env.BACKEND_BASE_URL || process.env.EXPO_PUBLIC_BACKEND_BASE_URL,
        IP_ADDR: process.env.IP_ADDR,
        ENABLE_LIBRE_TRANSLATE: process.env.ENABLE_LIBRE_TRANSLATE === "true",
        DISTRIBUTION_CHANNEL: process.env.DISTRIBUTION_CHANNEL || "direct",
        ANDROID_VERSION_CODE: 105,
        eas: {
          projectId: "39be103c-2ac5-446e-abc7-506f4c087c45",
        },
      },
      owner: "pingan-church",
    },
  };
