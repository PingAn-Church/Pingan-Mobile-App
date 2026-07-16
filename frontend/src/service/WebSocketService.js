import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuthToken } from "./TokenService";
import { getConversations } from "./ChatService";
import { apiUrl } from "./apiConfig";

let stompClient = null;
let isConnecting = false;
let heartbeatInterval = null;
let missedHeartbeats = 0;

// Always-current handlers; subscriptions read from here at message time so
// reconnects never deliver into stale closures.
let currentHandlers = {};

// Conversation ids with a live /topic/conversation-{id} subscription on the
// CURRENT connection. Subscriptions die with the connection, so this resets
// on every (re)connect.
let subscribedConversationIds = new Set();

export const getStompClient = () => stompClient;

const dispatchConversationPayload = (payload, onMessageReceived = null) => {
  if (payload?.eventType === "CONTENT_MODERATION") {
    currentHandlers.onModerationEvent?.(payload);
    return;
  }
  const handler = onMessageReceived || currentHandlers.onMessageReceived;
  handler?.(payload);
};

// Reconnect strategy: stompjs' built-in reconnectDelay handles transient drops
// (same credentials). If the socket stays down for several heartbeat ticks the
// token may have expired mid-session, so we rebuild the client from scratch to
// pick up fresh credentials. These are the ONLY two reconnect paths.
const HEARTBEAT_MS = 10000;
const MISSED_BEATS_BEFORE_REBUILD = 3;

const startHeartbeatCheck = () => {
  stopHeartbeatCheck();
  missedHeartbeats = 0;
  heartbeatInterval = setInterval(async () => {
    if (stompClient?.connected) {
      missedHeartbeats = 0;
      stompClient.publish({ destination: "/app/heartbeat" });
      return;
    }

    missedHeartbeats++;
    if (missedHeartbeats >= MISSED_BEATS_BEFORE_REBUILD) {
      console.warn("🔁 WebSocket down too long — rebuilding with fresh credentials...");
      await disconnectWebSocket();
      connectWebSocket(currentHandlers);
    }
  }, HEARTBEAT_MS);
};

const stopHeartbeatCheck = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};

/**
 * Subscribe to a group conversation topic on the current connection.
 * Safe to call repeatedly — duplicate subscriptions are skipped.
 */
export const subscribeToConversation = (conversationId, onMessageReceived = null) => {
  if (conversationId == null || !stompClient?.connected) return;

  const key = String(conversationId);
  if (subscribedConversationIds.has(key)) return;
  subscribedConversationIds.add(key);

  stompClient.subscribe(`/topic/conversation-${key}`, (msg) => {
    dispatchConversationPayload(JSON.parse(msg.body), onMessageReceived);
  });
};

export const connectWebSocket = async (handlers = {}, onConnected = null) => {
  currentHandlers = handlers;

  if (stompClient?.connected) {
    if (onConnected) onConnected();
    return;
  }
  // An activation (or stompjs auto-reconnect cycle) is already underway.
  if (isConnecting || stompClient?.active) return;
  isConnecting = true;

  try {
    const token = await getAuthToken();
    const user = JSON.parse((await AsyncStorage.getItem("user")) || "null");
    const deviceId = await AsyncStorage.getItem("deviceId");
    if (!token || !user || !deviceId) {
      console.warn("🔒 WebSocket connect skipped — missing token, user, or deviceId.");
      return;
    }

    let wsUrl;
    try {
      wsUrl = apiUrl(`/ws`);
    } catch (error) {
      console.error("WebSocket URL is not configured:", error);
      return;
    }

    stompClient = new Client({
      webSocketFactory: () => new SockJS(`${wsUrl}?token=${token}&deviceId=${deviceId}`),
      reconnectDelay: 5000,
      heartbeatIncoming: 20000,
      heartbeatOutgoing: 10000,
      onConnect: async () => {
        console.log("✅ WebSocket connected");
        subscribedConversationIds = new Set();

        stompClient.subscribe(`/user/${user.id}/queue/messages`, (msg) =>
          currentHandlers.onMessageReceived?.(JSON.parse(msg.body))
        );

        stompClient.subscribe(`/user/${user.id}/queue/delivery-status`, (msg) =>
          currentHandlers.onDeliveryStatusUpdate?.(JSON.parse(msg.body))
        );

        stompClient.subscribe(`/user/queue/status`, (msg) =>
          currentHandlers.onUserStatusUpdate?.(JSON.parse(msg.body))
        );

        stompClient.subscribe(`/user/${user.id}/queue/conversations`, (msg) =>
          currentHandlers.onChatUpdate?.(JSON.parse(msg.body))
        );

        stompClient.subscribe(`/user/${user.id}/queue/participant-updates`, (msg) =>
          currentHandlers.onParticipantUpdate?.(JSON.parse(msg.body))
        );

        stompClient.subscribe(`/user/${user.id}/queue/group-admin-updates`, (msg) =>
          currentHandlers.onGroupAdminUpdate?.(JSON.parse(msg.body))
        );

        stompClient.subscribe(`/user/${user.id}/queue/group-icon-updates`, (msg) =>
          currentHandlers.onGroupIconUpdate?.(JSON.parse(msg.body))
        );

        stompClient.subscribe(`/user/${user.id}/queue/moderation`, (msg) =>
          currentHandlers.onModerationEvent?.(JSON.parse(msg.body))
        );

        stompClient.subscribe(`/topic/content-moderation`, (msg) =>
          currentHandlers.onModerationEvent?.(JSON.parse(msg.body))
        );

        // Tell the server we are ready (presence + offline-queue drain). The user
        // queue above is already subscribed, so drained messages are not lost.
        if (user?.email) {
          stompClient.publish({
            destination: "/app/user-ready",
            body: JSON.stringify({ email: user.email }),
          });
        }

        startHeartbeatCheck();
        if (onConnected) onConnected();

        // Group topics need a REST round-trip; user queues above are already live.
        try {
          const conversations = await getConversations(user.id);
          conversations.forEach((conv) => {
            if (conv.conversationType === "group") {
              subscribeToConversation(conv.conversationId);
            }
          });
        } catch (err) {
          console.error("❌ Failed to subscribe group conversations:", err);
        }
      },
      onStompError: (frame) => {
        console.error("❌ STOMP error:", frame?.headers?.message || frame);
      },
      onWebSocketClose: () => {
        // stompjs auto-reconnects; just invalidate per-connection state.
        subscribedConversationIds = new Set();
      },
    });

    stompClient.activate();
  } finally {
    isConnecting = false;
  }
};

export const disconnectWebSocket = async () => {
  stopHeartbeatCheck();
  subscribedConversationIds = new Set();

  const client = stompClient;
  stompClient = null;
  if (client) {
    try {
      await client.deactivate();
    } catch (err) {
      console.error("❌ Error during WebSocket disconnect:", err);
    }
  }
};
