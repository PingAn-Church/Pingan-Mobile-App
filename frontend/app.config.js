import 'dotenv/config'

export default {
    expo: {
      name: "frontend",
      slug: "frontend",
      version: "1.0.0",
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
        bundleIdentifier: "com.fyp.pingan",
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
        package: "com.fyp.pingan",
        googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
      },
      web: {
        favicon: "./assets/favicon.png",
      },
      newArchEnabled: true,
      extra: {
        IP_ADDR: process.env.IP_ADDR,
        eas: {
          projectId: "deb6d7ce-979e-46e2-88fb-d9d1b2f3018d",
        },
      },
      owner: "pinganservice572",
    },
  };
  