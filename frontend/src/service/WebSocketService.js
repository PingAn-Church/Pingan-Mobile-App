import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuthToken } from "./TokenService";
import { getConversations } from "./ChatService";
import { apiUrl } from "./apiConfig";

const WS_URL = apiUrl(`/ws`);


let stompClient = null;
let retryCount = 0;
const MAX_RETRIES = 10;
let heartbeatInterval = null;

let currentHandlers = {};

export const getStompClient = () => stompClient;

const isNetworkAvailable = async () => {
  if (typeof window !== "undefined") return true; // assume browser has network
  try {
    const res = await fetch("https://www.google.com", { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
};

const startHeartbeatCheck = () => {
  stopHeartbeatCheck();
  heartbeatInterval = setInterval(() => {
    if (stompClient?.connected) {
      console.log("💓 Sending heartbeat...");
      stompClient.publish({ destination: "/app/heartbeat" });
    } else {
      console.warn("💔 Heartbeat failed. Attempting reconnect...");
      reconnectWebSocket(currentHandlers);
    }
  }, 10000);
};

const stopHeartbeatCheck = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};

export const connectWebSocket = async (handlers = {}, onConnected = null) => {
  if (stompClient?.connected) {
    console.log("🟢 WebSocket already connected.");
    if (onConnected) onConnected();
    return;
  }

  const network = await isNetworkAvailable();
  if (!network) {
    console.warn("📴 No network available.");
    return;
  }

  const token = await getAuthToken();
  const user = JSON.parse(await AsyncStorage.getItem("user"));
  if (!token || !user) {
    console.warn("🔒 Missing auth token or user.");
    return;
  }

  // const deviceId = await getDeviceId();
  // const deviceId = SecureStore.getItemAsync("deviceId");
  const deviceId = await AsyncStorage.getItem("deviceId");
  if (!deviceId) {
    console.error("Device ID not available");
    return;
  }

  currentHandlers = handlers;

  // const socket = new SockJS(`${WS_URL}?token=${token}`);
  const socket = new SockJS(`${WS_URL}?token=${token}&deviceId=${deviceId}`);
  stompClient = new Client({
    webSocketFactory: () => socket,
    debug: (str) => console.log(str),
    reconnectDelay: 5000,
    heartbeatIncoming: 20000,
    heartbeatOutgoing: 10000,
    onConnect: async () => {
      console.log("✅ WebSocket connected");

      const conversations = await getConversations(user.id);
      conversations.forEach((conv) => {
        if (conv.conversationType === "group") {
          stompClient.subscribe(`/topic/conversation-${conv.conversationId}`, (msg) =>
            handlers.onMessageReceived?.(JSON.parse(msg.body))
          );
        }
      });

      stompClient.subscribe(`/user/${user.id}/queue/messages`, (msg) =>
        handlers.onMessageReceived?.(JSON.parse(msg.body))
      );

      stompClient.subscribe(`/user/${user.id}/queue/delivery-status`, (msg) =>
        handlers.onDeliveryStatusUpdate?.(JSON.parse(msg.body))
      );

      stompClient.subscribe(`/user/queue/status`, (msg) =>
        handlers.onUserStatusUpdate?.(JSON.parse(msg.body))
      );

      stompClient.subscribe(`/user/${user.id}/queue/conversations`, (msg) =>
        handlers.onChatUpdate?.(JSON.parse(msg.body))
      );

      stompClient.subscribe(`/user/${user.id}/queue/participant-updates`, (msg) =>
        handlers.onParticipantUpdate?.(JSON.parse(msg.body))
      );

      stompClient.subscribe(`/user/${user.id}/queue/group-admin-updates`, (msg) =>
        handlers.onGroupAdminUpdate?.(JSON.parse(msg.body))
      );

      stompClient.subscribe(`/user/${user.id}/queue/group-icon-updates`, (msg) =>
        handlers.onGroupIconUpdate?.(JSON.parse(msg.body))
      );

      stompClient.subscribe(`/topic/threads`, (msg) =>
        handlers.onThreadMessage?.(JSON.parse(msg.body))
      );

      // ✅ Notify server that user is ready (for presence tracking)
      setTimeout(() => {
        const email = user?.email;
        if (stompClient?.connected && email) {
          stompClient.publish({
            destination: "/app/user-ready",
            body: JSON.stringify({ email }),
          });
          console.log("📣 Sent /app/user-ready for:", email);
        }
      }, 300);

      retryCount = 0;
      startHeartbeatCheck();
      if (onConnected) onConnected();
    },
    onStompError: (frame) => {
      console.error("❌ STOMP error:", frame);
      reconnectWebSocket(currentHandlers);
    },
    onWebSocketClose: () => {
      if (retryCount++ < MAX_RETRIES) {
        const delay = Math.min(5000 * Math.pow(2, retryCount), 60000);
        console.warn(`🔁 WebSocket closed. Reconnecting in ${delay / 1000}s...`);
        setTimeout(() => reconnectWebSocket(currentHandlers), delay);
      } else {
        console.error("🚫 Max retry attempts reached. Giving up.");
      }
    },
  });

  stompClient.activate();
};

// export const disconnectWebSocket = () => {
//   stopHeartbeatCheck();
//   if (stompClient) {
//     console.log("🔌 Disconnecting WebSocket...");
//     stompClient.deactivate().then(() => {
//       stompClient = null;
//     });
//   }
// };

export const disconnectWebSocket = () => {
  stopHeartbeatCheck();
  if (stompClient) {
    console.log("🔌 Disconnecting WebSocket...");
    stompClient.deactivate()
      .then(() => {
        stompClient = null;
        retryCount = 0; // ✅ Reset retry attempts
      })
      .catch((err) => {
        console.error("❌ Error during WebSocket disconnect:", err);
        stompClient = null;
      });
  }
};


const reconnectWebSocket = async (handlers = {}) => {
  if (retryCount >= MAX_RETRIES) return;

  const network = await isNetworkAvailable();
  if (!network) {
    console.warn("📴 Still no network. Retry skipped.");
    return;
  }

  const delay = Math.min(5000 * Math.pow(2, retryCount), 60000);
  console.log(`⏳ Reconnecting WebSocket in ${delay / 1000}s...`);

  setTimeout(() => connectWebSocket(handlers), delay);
};
