import { Platform } from "react-native";

// Shadow presets. Web uses boxShadow; iOS uses shadow*; Android uses elevation.
export const shadows = {
  card: Platform.select({
    web: { boxShadow: "0px 2px 4px rgba(0,0,0,0.1)" },
    default: {
      elevation: 2,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
  }),
};
