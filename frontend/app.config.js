import 'dotenv/config'

export default {
    expo: {
      name: "frontend",
      slug: "pingan-mobile-app",
      version: "0.0.1",
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
        infoPlist: {
          NSPhotoLibraryUsageDescription:
            "We need access to your photo library to upload profile images.",
          NSCameraUsageDescription:
            "We need access to your camera to take profile pictures.",
          NSPhotoLibraryAddUsageDescription:
            "We need permission to save images to your photo library.",
        },
        bundleIdentifier: "org.pingan.rn-app",
      },
      android: {
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#ffffff",
        },
        permissions: [
          "CAMERA",
          "READ_EXTERNAL_STORAGE",
          "WRITE_EXTERNAL_STORAGE",
        ],
        package: "org.pingan.rn-app",
        googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
      },
      web: {
        favicon: "./assets/favicon.png",
      },
      newArchEnabled: true,
      plugins: [
        "expo-font",
      ],
      extra: {
        BACKEND_BASE_URL: process.env.BACKEND_BASE_URL || process.env.EXPO_PUBLIC_BACKEND_BASE_URL,
        IP_ADDR: process.env.IP_ADDR,
        ENABLE_LIBRE_TRANSLATE: process.env.ENABLE_LIBRE_TRANSLATE === "true",
        eas: {
          projectId: "39be103c-2ac5-446e-abc7-506f4c087c45",
        },
      },
      owner: "pingan-church",
    },
  };
