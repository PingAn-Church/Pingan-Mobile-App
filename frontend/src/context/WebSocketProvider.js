// import React, { useEffect, useContext } from "react";
// import { AppState } from "react-native";
// import { connectWebSocket, disconnectWebSocket } from "../service/WebSocketService";
// import { ChatContext } from "./ChatContext";
// import { UserContext } from "./UserContext";

// const WebSocketProvider = ({ children }) => {
//   const { user } = useContext(UserContext);
//   const chat = useContext(ChatContext);

//   useEffect(() => {
//     if (!user || !user.id) return;

//     console.log("🔌 [WebSocketProvider] Connecting WebSocket...");

//     connectWebSocket(
//         {
//             onMessageReceived: chat.handleWebSocketMessage,
//             onUserStatusUpdate: chat.handleUserStatusUpdate,
//             onDeliveryStatusUpdate: chat.handleDeliveryStatusUpdate,
//             onChatUpdate: chat.handleChatUpdate,
//             onParticipantUpdate: chat.handleParticipantUpdate,
//             onGroupAdminUpdate: chat.handleGroupAdminUpdate,
//             onGroupIconUpdate: chat.handleGroupIconUpdate,
//         },
//         () => {
//             // ✅ WebSocket is ready — now fetch chat data
//             console.log("🚀 WebSocket connected — fetching initial chat data");
//             chat.fetchInitialData();
//         }
//     );
      

//     // 3️⃣ Listen for app state change to reconnect if needed
//     const appStateListener = AppState.addEventListener("change", (state) => {
//       if (state === "active") {
//         console.log("📲 App returned to foreground — checking WebSocket...");
//         connectWebSocket({
//           onMessageReceived: chat.handleWebSocketMessage,
//           onUserStatusUpdate: chat.handleUserStatusUpdate,
//           onDeliveryStatusUpdate: chat.handleDeliveryStatusUpdate,
//           onChatUpdate: chat.handleChatUpdate,
//           onParticipantUpdate: chat.handleParticipantUpdate,
//           onGroupAdminUpdate: chat.handleAdminUpdate,
//           onGroupIconUpdate: chat.handleGroupIconUpdate,
//         });
//       }
//     });

//     return () => {
//       console.log("🛑 [WebSocketProvider] Disconnecting WebSocket...");
//       disconnectWebSocket();
//       appStateListener.remove();
//     };
//   }, [user]);

//   return <>{children}</>;
// };

// export { WebSocketProvider };


// Replace your existing WebSocketProvider code with this:

import React, { useEffect, useContext, useRef } from "react";
import { AppState } from "react-native";
import { connectWebSocket, disconnectWebSocket } from "../service/WebSocketService";
import { ChatContext } from "./ChatContext";
import { UserContext } from "./UserContext";

const WebSocketProvider = ({ children }) => {
  // const { user } = useContext(UserContext);
  const { user, userReady } = useContext(UserContext);
  const chat = useContext(ChatContext);
  const appState = useRef(AppState.currentState);
  const isConnectedRef = useRef(false);

  // useEffect(() => {
  //   const onAppStateChange = async (nextState) => {
  //     // Runs once, but does not execute the if(user) portion, since user context is stale when re-entering from bg.
  //     // Depends on useEffect below.
  //     if (appState.current.match(/inactive|background/) && nextState === "active") {
  //       console.log("📲 App in foreground — reconnecting WebSocket...");
  //       if (user) {
  //         await connectWebSocket({
  //           onMessageReceived: chat.handleWebSocketMessage,
  //           onUserStatusUpdate: chat.handleUserStatusUpdate,
  //           onDeliveryStatusUpdate: chat.handleDeliveryStatusUpdate,
  //           onChatUpdate: chat.handleChatUpdate,
  //           onParticipantUpdate: chat.handleParticipantUpdate,
  //           onGroupAdminUpdate: chat.handleGroupAdminUpdate,
  //           onGroupIconUpdate: chat.handleGroupIconUpdate,
  //         }, () => {
  //           chat.fetchInitialData();
  //         });
  //       }
  //     }

  //     if (nextState === "background") {
  //       console.log("🌙 App in background — disconnecting WebSocket...");
  //       disconnectWebSocket();
  //     }

  //     appState.current = nextState;
  //   };

  //   const listener = AppState.addEventListener("change", onAppStateChange);
  //   return () => listener.remove();
  // }, [user]);

  useEffect(() => {
    const onAppStateChange = async (nextState) => {
      const prevState = appState.current;
      appState.current = nextState;
  
      if (prevState.match(/inactive|background/) && nextState === "active") {
        console.log("📲 App resumed");
        if (userReady && !isConnectedRef.current) {
          await connectWebSocket({
            onMessageReceived: chat.handleWebSocketMessage,
            onUserStatusUpdate: chat.handleUserStatusUpdate,
            onDeliveryStatusUpdate: chat.handleDeliveryStatusUpdate,
            onChatUpdate: chat.handleChatUpdate,
            onParticipantUpdate: chat.handleParticipantUpdate,
            onGroupAdminUpdate: chat.handleGroupAdminUpdate,
            onGroupIconUpdate: chat.handleGroupIconUpdate,
          }, () => {
            chat.fetchInitialData();
            isConnectedRef.current = true;
          });
        }
      }
  
      if (nextState === "background") {
        console.log("🌙 App backgrounded — disconnecting WebSocket");
        disconnectWebSocket();
        isConnectedRef.current = false;
      }
    };
  
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, [user, userReady]);
  

  // Initial connection
  // useEffect(() => {
  //   if (!user) return;
  //   connectWebSocket({
  //     onMessageReceived: chat.handleWebSocketMessage,
  //     onUserStatusUpdate: chat.handleUserStatusUpdate,
  //     onDeliveryStatusUpdate: chat.handleDeliveryStatusUpdate,
  //     onChatUpdate: chat.handleChatUpdate,
  //     onParticipantUpdate: chat.handleParticipantUpdate,
  //     onGroupAdminUpdate: chat.handleGroupAdminUpdate,
  //     onGroupIconUpdate: chat.handleGroupIconUpdate,
  //   }, () => {
  //     chat.fetchInitialData();
  //   });
  // }, [user]);

  useEffect(() => {
    if (!userReady || !user) return;
  
    const connect = async () => {
      await connectWebSocket({
        onMessageReceived: chat.handleWebSocketMessage,
        onUserStatusUpdate: chat.handleUserStatusUpdate,
        onDeliveryStatusUpdate: chat.handleDeliveryStatusUpdate,
        onChatUpdate: chat.handleChatUpdate,
        onParticipantUpdate: chat.handleParticipantUpdate,
        onGroupAdminUpdate: chat.handleGroupAdminUpdate,
        onGroupIconUpdate: chat.handleGroupIconUpdate,
      }, () => {
        chat.fetchInitialData();
        isConnectedRef.current = true;
      });
    };
  
    connect();
  
    return () => {
      disconnectWebSocket();
      isConnectedRef.current = false;
    };
  }, [userReady]);  

  return <>{children}</>;
};

export { WebSocketProvider };
