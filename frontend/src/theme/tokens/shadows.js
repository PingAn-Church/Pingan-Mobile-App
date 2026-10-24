import { Platform } from "react-native";

// Shadow presets. Web uses boxShadow; iOS uses shadow*; Android uses elevation.
export const shadows = {
  // Cards resting on the page.
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
  // Floating round buttons that stay in place over the content (Chats +, jump to latest).
  button: Platform.select({
    web: { boxShadow: "0px 2px 5px rgba(0,0,0,0.15)" },
    default: {
      elevation: 5,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 5,
    },
  }),
  // Menus and pop-ups that float above the page.
  popup: Platform.select({
    web: { boxShadow: "0px 5px 10px rgba(0,0,0,0.15)" },
    default: {
      elevation: 8,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
    },
  }),
};
