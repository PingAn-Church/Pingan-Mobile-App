import React, { useEffect, useContext, useRef } from "react";
import { AppState } from "react-native";
import { connectWebSocket, disconnectWebSocket } from "../service/WebSocketService";
import { ChatContext } from "./ChatContext";
import { UserContext } from "./UserContext";
import { emitModerationEvent } from "../service/ModerationEventService";

const WebSocketProvider = ({ children }) => {
  const { user, userReady } = useContext(UserContext);
  const chat = useContext(ChatContext);
  const appState = useRef(AppState.currentState);
  const isConnectedRef = useRef(false);

  const handleModerationEvent = (event) => {
    chat.handleModerationEvent(event);
    emitModerationEvent(event);
  };

  const buildHandlers = () => ({
    onMessageReceived: chat.handleWebSocketMessage,
    onUserStatusUpdate: chat.handleUserStatusUpdate,
    onDeliveryStatusUpdate: chat.handleDeliveryStatusUpdate,
    onChatUpdate: chat.handleChatUpdate,
    onParticipantUpdate: chat.handleParticipantUpdate,
    onGroupAdminUpdate: chat.handleGroupAdminUpdate,
    onGroupIconUpdate: chat.handleGroupIconUpdate,
    onModerationEvent: handleModerationEvent,
  });

  // Reconnect when the app returns to the foreground; drop the socket in background.
  useEffect(() => {
    const onAppStateChange = async (nextState) => {
      const prevState = appState.current;
      appState.current = nextState;

      if (prevState.match(/inactive|background/) && nextState === "active") {
        if (userReady && !isConnectedRef.current) {
          await connectWebSocket(buildHandlers(), () => {
            chat.fetchInitialData();
            isConnectedRef.current = true;
          });
        }
      }

      if (nextState === "background") {
        disconnectWebSocket();
        isConnectedRef.current = false;
      }
    };

    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, [user, userReady]);

  // Initial connection once the user session is restored.
  useEffect(() => {
    if (!userReady || !user) return;

    connectWebSocket(buildHandlers(), () => {
      chat.fetchInitialData();
      isConnectedRef.current = true;
    });

    return () => {
      disconnectWebSocket();
      isConnectedRef.current = false;
    };
  }, [userReady]);

  return <>{children}</>;
};

export { WebSocketProvider };
