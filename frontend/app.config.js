import 'dotenv/config'

// Single source for the iOS photo-library prompts. Three places declare these
// keys — ios.infoPlist, the expo-image-picker plugin and the expo-media-library
// plugin — and whichever wins at prebuild time is an implementation detail of
// mod ordering. Pointing all of them at the same constants means the generated
// Info.plist reads the same either way, instead of three strings drifting apart.
//
// Reading the library is never prompted for: both pickers use the system photo
// picker, so only the file the user selects reaches the app. The add-only
// prompt is the one users actually see, when saving an image to their gallery.
const PHOTO_LIBRARY_USAGE_DESCRIPTION =
  "We need access to your photo library so you can choose images to upload.";
const PHOTO_LIBRARY_ADD_USAGE_DESCRIPTION =
  "We need permission to save images to your photo library.";

export default {
    expo: {
      name: "Ping An",
      slug: "pingan-mobile-app",
      version: "1.1.3",
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
        buildNumber: "10103",
        // Push entitlement. It used to live only in the generated
        // ios/frontend.entitlements, which `expo prebuild --clean` rebuilds from
        // this config — so a regeneration silently dropped it and killed iOS
        // push. "development" is what a local `expo run:ios` needs; EAS Build
        // overrides it from the provisioning profile for release builds.
        entitlements: {
          "aps-environment": "development",
        },
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
          NSPhotoLibraryUsageDescription: PHOTO_LIBRARY_USAGE_DESCRIPTION,
          NSPhotoLibraryAddUsageDescription: PHOTO_LIBRARY_ADD_USAGE_DESCRIPTION,
          NSMicrophoneUsageDescription:
            "We need access to your microphone to record voice messages.",
        },
        bundleIdentifier: "org.pingan.app",
      },
      android: {
        adaptiveIcon: {
          // foregroundImage keeps the logo inside the centre 66% (Android's
          // 72dp-of-108dp safe zone) with transparent padding around it —
          // anything outside that is cropped by the launcher's mask. The
          // padding is transparent so this colour is what shows behind it.
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#FFFFFF",
        },
        permissions: [
          "WRITE_EXTERNAL_STORAGE",
          "RECORD_AUDIO",
          "MODIFY_AUDIO_SETTINGS",
        ],
        blockedPermissions: [
          "android.permission.READ_EXTERNAL_STORAGE",
          "android.permission.READ_MEDIA_IMAGES",
          "android.permission.READ_MEDIA_VIDEO",
          "android.permission.READ_MEDIA_AUDIO",
          "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
        ],
        package: "org.pingan.app",
        versionCode: 10103,
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
        [
          "expo-image-picker",
          {
            photosPermission: PHOTO_LIBRARY_USAGE_DESCRIPTION,
            // false also blocks android.permission.CAMERA — nothing in the app
            // calls launchCameraAsync, so neither platform asks for the camera.
            cameraPermission: false,
          },
        ],
        [
          "expo-media-library",
          {
            photosPermission: PHOTO_LIBRARY_USAGE_DESCRIPTION,
            savePhotosPermission: PHOTO_LIBRARY_ADD_USAGE_DESCRIPTION,
            // No READ_MEDIA_* permissions: media is only ever selected through
            // the system photo picker, which needs none of them.
            granularPermissions: [],
          },
        ],
        "./plugins/withAndroidMediaPermissions",
        "expo-localization",
        "expo-status-bar",
        "@react-native-community/datetimepicker",
        // Shrink release builds: R8 removes unused code, and unused resources are
        // stripped. Release-only, so `npm run android` (a debug build) is
        // unaffected. These were hand-written into gradle.properties and
        // `expo prebuild --clean` dropped them; as a plugin they are regenerated.
        [
          "expo-build-properties",
          {
            android: {
              enableMinifyInReleaseBuilds: true,
              enableShrinkResourcesInReleaseBuilds: true,
            },
          },
        ],
      ],
      extra: {
        BACKEND_BASE_URL: process.env.BACKEND_BASE_URL || process.env.EXPO_PUBLIC_BACKEND_BASE_URL,
        IP_ADDR: process.env.IP_ADDR,
        ENABLE_LIBRE_TRANSLATE: process.env.ENABLE_LIBRE_TRANSLATE === "true",
        DISTRIBUTION_CHANNEL: process.env.DISTRIBUTION_CHANNEL || "direct",
        ANDROID_VERSION_CODE: 10103,
        eas: {
          projectId: "39be103c-2ac5-446e-abc7-506f4c087c45",
        },
      },
      owner: "pingan-church",
    },
  };
