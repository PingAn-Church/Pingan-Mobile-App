import React, { useEffect, useContext, useRef } from "react";
import { AppState } from "react-native";
import { connectWebSocket, disconnectWebSocket } from "../service/WebSocketService";
import { ChatContext } from "./ChatContext";
import { UserContext } from "./UserContext";
import { emitModerationEvent } from "../service/ModerationEventService";

const WebSocketProvider = ({ children }) => {
  const { user, userReady, applyPermissionUpdate } = useContext(UserContext);
  const chat = useContext(ChatContext);
  const appState = useRef(AppState.currentState);
  const isConnectedRef = useRef(false);
  // Any signed-in account gets a socket, verified or not. An unverified one
  // subscribes to nothing but its own permission feed, which is how being
  // approved takes effect without a poll or a sign-in.
  const socketEligible = Boolean(userReady && user?.id);
  const verified = Boolean(user?.verifiedUser);

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
    onGroupNoticeUpdate: chat.handleGroupNoticeUpdate,
    onModerationEvent: handleModerationEvent,
    onPermissionUpdate: applyPermissionUpdate,
  });

  // Reconnect when the app returns to the foreground; drop the socket in background.
  useEffect(() => {
    const onAppStateChange = async (nextState) => {
      const prevState = appState.current;
      appState.current = nextState;

      if (prevState.match(/inactive|background/) && nextState === "active") {
        if (socketEligible && !isConnectedRef.current) {
          await connectWebSocket(
            buildHandlers(),
            (prefetchedConversations) => {
              chat.fetchInitialData(prefetchedConversations);
              isConnectedRef.current = true;
            },
            { verified }
          );
        }
      }

      if (nextState === "background") {
        disconnectWebSocket();
        isConnectedRef.current = false;
      }
    };

    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, [socketEligible, user?.id, verified]);

  // Initial connection once the user session is restored.
  useEffect(() => {
    if (!socketEligible) {
      disconnectWebSocket();
      isConnectedRef.current = false;
      return;
    }

    connectWebSocket(
      buildHandlers(),
      (prefetchedConversations) => {
        chat.fetchInitialData(prefetchedConversations);
        isConnectedRef.current = true;
      },
      { verified }
    );

    return () => {
      disconnectWebSocket();
      isConnectedRef.current = false;
    };
    // `verified` is a dependency on purpose: being approved has to rebuild the
    // socket so the chat subscriptions this session skipped are established.
  }, [socketEligible, user?.id, verified]);

  return <>{children}</>;
};

export { WebSocketProvider };
