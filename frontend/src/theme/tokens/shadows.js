import { Platform } from "react-native";

// Shadow presets. Web uses boxShadow; iOS uses shadow*; Android uses elevation.
export const shadows = {
  card: Platform.select({
    web: { boxShadow: "0px 4px 6px rgba(0,0,0,0.05)" },
    default: {
      elevation: 2,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
    },
  }),
};
