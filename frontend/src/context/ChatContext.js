import React, { createContext, useContext, useState, useEffect, useRef } from "react";
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
  // Delivery receipts already sent this session. handleWebSocketMessage sends
  // from inside a state updater, which React may invoke more than once — this
  // set makes the send idempotent.
  const sentDeliveryReceiptsRef = useRef(new Set());

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
          // Load only the newest page; older messages stream in on scroll-back.
          const page = await getChatHistory(conv.conversationId, conv.conversationType, null, 30);
          return {
            ...conv,
            chatHistory: page?.messages || [],
            oldestCursor: page?.nextCursor ?? null,
            hasMoreHistory: Boolean(page?.hasMore),
          };
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
  };

  // Tracks in-flight scroll-back loads so concurrent onEndReached calls coalesce.
  const loadingOlderRef = useRef(new Set());

  // Prepend the next older page of a conversation's history (cursor pagination).
  const loadOlderMessages = async (conversationId, conversationType, before) => {
    if (before == null) return;
    if (loadingOlderRef.current.has(conversationId)) return;
    loadingOlderRef.current.add(conversationId);
    try {
      const page = await getChatHistory(conversationId, conversationType, before, 30);
      const older = page?.messages || [];
      setConversations((prev) =>
        prev.map((c) =>
          String(c.conversationId) === String(conversationId)
            ? {
                ...c,
                chatHistory: dedupeMessagesById([...older, ...(c.chatHistory || [])]),
                oldestCursor: page?.nextCursor ?? c.oldestCursor,
                hasMoreHistory: Boolean(page?.hasMore),
              }
            : c
        )
      );
    } catch (err) {
      console.error("❌ Failed to load older messages:", err);
    } finally {
      loadingOlderRef.current.delete(conversationId);
    }
  };

  const handleWebSocketMessage = (message) => {
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

        // A genuinely new message from someone else bumps the unread badge live;
        // it resets to 0 when the conversation is viewed (see ChatPage read effect).
        const isNewIncoming =
          message.senderId !== user?.id &&
          !message.deleted &&
          exists === -1 &&
          optimisticIndex === -1;

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

        return {
          ...conv,
          chatHistory,
          unreadCount: (conv.unreadCount || 0) + (isNewIncoming ? 1 : 0),
        };
      });

      return updated;
    });
  };

  const handleModerationEvent = (event) => {
    if (event?.contentType !== "MESSAGE") return;

    setConversations((prev) =>
      prev.map((conversation) => {
        if (String(conversation.conversationId) !== String(event.conversationId)) {
          return conversation;
        }

        let chatHistory = [...(conversation.chatHistory || [])];
        if (event.state === "DELETED") {
          chatHistory = chatHistory.filter(
            (message) => String(message.messageId) !== String(event.contentId)
          );
        } else {
          chatHistory = chatHistory.map((message) => {
            if (String(message.messageId) !== String(event.contentId)) return message;
            if (event.state === "PENDING") {
              const canKeepContent =
                String(message.senderId) === String(user?.id) || user?.admin;
              return {
                ...message,
                reported: true,
                content: canKeepContent ? message.content : null,
              };
            }
            if (event.state === "RESTORED") {
              return { ...message, reported: false };
            }
            return message;
          });
        }

        return { ...conversation, chatHistory };
      })
    );
  };

  const sendDeliveryStatusUpdate = (statusUpdate) => {
    const receiptKey = `${statusUpdate.messageId}:${JSON.stringify(statusUpdate.deliveryStatus)}`;
    if (sentDeliveryReceiptsRef.current.has(receiptKey)) return;

    const client = getStompClient();
    if (client?.connected) {
      sentDeliveryReceiptsRef.current.add(receiptKey);
      if (sentDeliveryReceiptsRef.current.size > 5000) {
        sentDeliveryReceiptsRef.current.clear();
      }
      client.publish({
        destination: "/app/updateDeliveryStatus",
        body: JSON.stringify(statusUpdate),
      });
    }
  };

  const handleUserStatusUpdate = (msg) => {
    // Presence is now keyed by user id (backend stopped broadcasting emails).
    const key = msg.userId || msg.userEmail;
    if (!key || key === "undefined") return;
    setUserStatus((prev) => ({ ...prev, [String(key)]: msg.status }));
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

  const handleChatUpdate = async (newChat) => {
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

    if (!enriched.chatHistory) {
      try {
        const page = await getChatHistory(enriched.conversationId, enriched.conversationType, null, 30);
        enriched.chatHistory = page?.messages || [];
        enriched.oldestCursor = page?.nextCursor ?? null;
        enriched.hasMoreHistory = Boolean(page?.hasMore);
      } catch (err) {
        console.error("❌ Failed to enrich chat history:", err);
        enriched.chatHistory = [];
      }
    }


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

    // New group chats need a live topic subscription on the current connection;
    // private chats arrive on the per-user queue and need no extra subscription.
    if (enriched.conversationType === "group") {
      subscribeToConversation(enriched.conversationId);
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
        loadOlderMessages,
        handleWebSocketMessage,
        handleUserStatusUpdate,
        handleDeliveryStatusUpdate,
        handleChatUpdate,
        handleParticipantUpdate,
        handleGroupAdminUpdate,
        handleGroupIconUpdate,
        handleModerationEvent,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
