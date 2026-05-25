import React, { createContext, useContext, useState, useEffect } from "react";
import { getConversations, getChatHistory } from "../service/ChatService";
import { getOnlineUsers } from "../service/UserService";
import { getStompClient, subscribeToConversation } from "../service/WebSocketService";
import { UserContext } from "./UserContext";

export const ChatContext = createContext();

const dedupeMessagesById = (messages = []) => {
  const next = [...messages];
  const firstIndexByMessageId = new Map();

  messages.forEach((message, index) => {
    const messageId = message?.messageId;
    if (messageId === null || messageId === undefined) return;

    const key = String(messageId);
    const firstIndex = firstIndexByMessageId.get(key);

    if (firstIndex === undefined) {
      firstIndexByMessageId.set(key, index);
      return;
    }

    next[firstIndex] = { ...next[firstIndex], ...message };
    next[index] = null;
  });

  return next.filter(Boolean);
};

const isOptimisticMatch = (optimisticMessage, incomingMessage) =>
  Boolean(optimisticMessage?.pending) &&
  String(optimisticMessage?.senderId) === String(incomingMessage?.senderId) &&
  String(optimisticMessage?.conversationId) === String(incomingMessage?.conversationId) &&
  String(optimisticMessage?.type || "text") === String(incomingMessage?.type || "text") &&
  String(optimisticMessage?.content || "") === String(incomingMessage?.content || "");

export const ChatProvider = ({ children }) => {
  // const { user, setUserStatus } = useContext(UserContext);
  const { user, userReady, setUserStatus } = useContext(UserContext);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userReady && user?.id) {
      fetchInitialData();
    }
  }, [userReady]);

  useEffect(() => {
    if (!user) {
      resetChat(); // Clear chat when user logs out
    }
  }, [user]);  
  
  const resetChat = () => {
    setConversations([]);
    setLoading(true);
  };
  

  const fetchConversations = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const fetched = await getConversations(user.id);
      const enriched = await Promise.all(
        fetched.map(async (conv) => {
          const chatHistory = await getChatHistory(conv.conversationId, conv.conversationType);
          return { ...conv, chatHistory };
        })
      );
      setConversations(enriched);
    } catch (err) {
      console.error("❌ Failed to fetch conversations:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchInitialData = async () => {
    await fetchConversations();
    console.log("✅ Initial chat data loaded");
  };

  const handleWebSocketMessage = (message) => {
    console.log("📩 WebSocket message:", message);

    setConversations((prev) => {
      let updated = prev.map((conv) => {
        if (String(conv.conversationId) !== String(message.conversationId)) return conv;

        let chatHistory = [...(conv.chatHistory || [])];

        if (message.deleted) {
          chatHistory = chatHistory.filter((msg) => msg.messageId !== message.messageId);
        } else if (message.edited) {
          chatHistory = chatHistory.map((msg) =>
            msg.messageId === message.messageId ? { ...msg, content: message.content } : msg
          );
        }

        const exists = chatHistory.findIndex((msg) => msg.messageId === message.messageId);
        const optimisticIndex = chatHistory.findIndex((msg) => isOptimisticMatch(msg, message));

        if (exists === -1 && optimisticIndex !== -1 && !message.deleted) {
          chatHistory[optimisticIndex] = {
            ...chatHistory[optimisticIndex],
            ...message,
            pending: false,
            failed: false,
            deliveryStatus: message.deliveryStatus || chatHistory[optimisticIndex].deliveryStatus || {},
          };
        } else if (exists === -1 && !message.deleted) {
          chatHistory.push({ ...message, deliveryStatus: message.deliveryStatus || {} });
        } else if (!message.deleted) {
          chatHistory[exists] = { ...chatHistory[exists], ...message, pending: false, failed: false };
        }

        chatHistory = dedupeMessagesById(chatHistory);

        // 📡 Send delivery status if needed
        if (message.senderId !== user?.id && !message.deleted) {
          sendDeliveryStatusUpdate({
            messageId: message.messageId,
            conversationId: message.conversationId,
            conversationType: conv.conversationType,
            senderId: message.senderId,
            deliveryStatus: { [user.id]: "DELIVERED" },
          });
        }

        return { ...conv, chatHistory };
      });

      return updated;
    });
  };

  const sendDeliveryStatusUpdate = (statusUpdate) => {
    const client = getStompClient();
    if (client?.connected) {
      client.publish({
        destination: "/app/updateDeliveryStatus",
        body: JSON.stringify(statusUpdate),
      });
      console.log("📡 Delivery status update sent:", statusUpdate);
    }
  };

  const handleUserStatusUpdate = (msg) => {
    const key = msg.userEmail || msg.userId;
    if (!key || key === "undefined") return;
    setUserStatus((prev) => ({ ...prev, [key]: msg.status }));
  };

  const handleDeliveryStatusUpdate = (msg) => {
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.conversationId !== msg.conversationId) return conv;

        const updatedChatHistory = conv.chatHistory?.map((m) =>
          m.messageId === msg.messageId
            ? {
                ...m,
                deliveryStatus: { ...m.deliveryStatus, ...msg.deliveryStatus },
              }
            : m
        );

        let updatedLastMessage = conv.lastMessage;
        if (updatedLastMessage?.messageId === msg.messageId) {
          updatedLastMessage = {
            ...updatedLastMessage,
            deliveryStatus: {
              ...updatedLastMessage.deliveryStatus,
              ...msg.deliveryStatus,
            },
          };
        }

        return {
          ...conv,
          chatHistory: updatedChatHistory,
          lastMessage: updatedLastMessage,
        };
      })
    );
  };

  const tryGetChatHistoryWithRetry = async (conversationId, conversationType, maxRetries = 3) => {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const history = await getChatHistory(conversationId, conversationType);
        return history;
      } catch (err) {
        if (err.response?.status === 403) {
          console.log(`🔁 Retry ${attempt + 1}: waiting before retrying getChatHistory`);
          await new Promise(res => setTimeout(res, 1000)); // wait 1 sec
          attempt++;
        } else {
          throw err; // throw if it's another error (network, 500, etc.)
        }
      }
    }
    throw new Error("Failed to fetch chat history after multiple retries");
  };
  

  const handleChatUpdate = async (newChat) => {
    console.log("NEW CHAT RECEIVED in handleChatUpdate", newChat);
    if (!newChat) return;

    // 🧹 Handle deletion
  if (newChat?.deleted && newChat.conversationId) {
    setConversations((prev) =>
      prev.filter((conv) => conv.conversationId !== newChat.conversationId)
    );
    console.log(`🗑️ Conversation ${newChat.conversationId} was deleted.`);
    return;
  }

    const isParticipant = newChat.participants.includes(user?.id);
    if (!isParticipant) {
      setConversations((prev) =>
        prev.filter((conv) => conv.conversationId !== newChat.conversationId)
      );
      return;
    }

    let enriched = { ...newChat };
    
    console.log("ENRICHED", enriched)

    if (!enriched.chatHistory) {
      try {
        const history = await getChatHistory(enriched.conversationId, enriched.conversationType);
        enriched.chatHistory = history || [];
      } catch (err) {
        console.error("❌ Failed to enrich chat history:", err);
        enriched.chatHistory = [];
      }
    }

    // if (!enriched.chatHistory) {
    //   try {
    //     const history = await tryGetChatHistoryWithRetry(
    //       enriched.conversationId,
    //       enriched.conversationType
    //     );
    //     enriched.chatHistory = history || [];
    //   } catch (err) {
    //     console.error("❌ Failed to enrich chat history after retries:", err);
    //     enriched.chatHistory = [];
    //   }
    // }
    

    setConversations((prev) => {
      const existingIdx = prev.findIndex((c) => c.conversationId === enriched.conversationId);

      if (existingIdx === -1) {
        markMessagesAsDelivered(enriched);
        return [...prev, enriched];
      }

      const prevConv = prev[existingIdx];
      const removedId = getRemovedParticipant(prevConv.participants, enriched.participants);

      if (removedId) {
        if (removedId === user.id) {
          return prev.filter((c) => c.conversationId !== enriched.conversationId);
        }

        const cleanedMessages = prevConv.chatHistory?.map((m) => {
          const { [removedId]: _, ...rest } = m.deliveryStatus || {};
          return { ...m, deliveryStatus: rest };
        }) || [];

        const updated = {
          ...prevConv,
          participants: enriched.participants.map(Number),
          participantNames: enriched.participantNames,
          chatHistory: cleanedMessages,
        };

        const copy = [...prev];
        copy[existingIdx] = updated;
        return copy;
      }

      return prev;
    });

    if (typeof subscribeToConversation === "function") {
      subscribeToConversation(enriched.conversationId, handleWebSocketMessage);
    }
  };

  const getRemovedParticipant = (before, after) => {
    return before.find((id) => !after.includes(id));
  };

  const markMessagesAsDelivered = (conv) => {
    if (!conv.chatHistory?.length) return;
    conv.chatHistory.forEach((msg) => {
      if (msg.senderId !== user?.id && msg.deliveryStatus?.[user.id] !== "DELIVERED") {
        sendDeliveryStatusUpdate({
          messageId: msg.messageId,
          conversationId: conv.conversationId,
          conversationType: conv.conversationType,
          senderId: msg.senderId,
          deliveryStatus: { [user.id]: "DELIVERED" },
        });
      }
    });
  };

  const handleParticipantUpdate = (updatedConv) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.conversationId === updatedConv.conversationId
          ? {
              ...conv,
              participants: updatedConv.participants.map(Number),
              participantNames: [...updatedConv.participantNames],
            }
          : conv
      )
    );
  };

  const handleGroupAdminUpdate = (msg) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.conversationId === msg.conversationId
          ? {
              ...conv,
              adminIds: msg.adminIds,
              adminNames: msg.adminNames,
            }
          : conv
      )
    );
  };

  const handleGroupIconUpdate = (msg) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.conversationId === msg.conversationId
          ? { ...conv, groupIcon: msg.groupIcon }
          : conv
      )
    );
  };

  return (
    <ChatContext.Provider
      value={{
        conversations,
        loading,
        resetChat,
        setConversations,
        fetchInitialData,
        handleWebSocketMessage,
        handleUserStatusUpdate,
        handleDeliveryStatusUpdate,
        handleChatUpdate,
        handleParticipantUpdate,
        handleGroupAdminUpdate,
        handleGroupIconUpdate,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
