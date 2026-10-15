import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getConversations, getChatHistory, getGroupReadWatermarks } from "../service/ChatService";
import { getTopicUnreadCount } from "../service/ThreadService";
import { getOnlineUsers } from "../service/UserService";
import { getStompClient, subscribeToConversation } from "../service/WebSocketService";
import { UserContext } from "./UserContext";
import { mergeReactions } from "../utils/reactions";
import { mergePoll } from "../utils/polls";

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
  const socialSessionKey = userReady && user?.id && user?.verifiedUser
    ? String(user.id)
    : null;
  const socialSessionKeyRef = useRef(socialSessionKey);
  socialSessionKeyRef.current = socialSessionKey;
  // Delivery receipts already sent this session. handleWebSocketMessage sends
  // from inside a state updater, which React may invoke more than once — this
  // set makes the send idempotent.
  const sentDeliveryReceiptsRef = useRef(new Set());

  // Unsent words per conversation, so leaving a chat half-typed loses nothing;
  // the list row previews them as "[Draft] …". Kept on the device, per account.
  const [drafts, setDrafts] = useState({});
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const draftsKey = user?.id ? `chat.drafts.${user.id}` : null;
  useEffect(() => {
    let active = true;
    setDraftsLoaded(false);
    setDrafts({});
    if (!draftsKey) return undefined;
    AsyncStorage.getItem(draftsKey)
      .then((raw) => {
        if (active && raw) setDrafts(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setDraftsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [draftsKey]);
  useEffect(() => {
    if (!draftsLoaded || !draftsKey) return;
    AsyncStorage.setItem(draftsKey, JSON.stringify(drafts)).catch(() => {});
  }, [drafts, draftsLoaded, draftsKey]);
  const saveDraft = useCallback((conversationId, text) => {
    const key = String(conversationId ?? "");
    if (!key) return;
    const value = String(text || "");
    setDrafts((prev) => {
      if ((prev[key] || "") === value) return prev;
      const next = { ...prev };
      if (value.trim()) next[key] = value;
      else delete next[key];
      return next;
    });
  }, []);

  // Who in each group has read up to where: conversation id → { user id → last
  // read message id }. Fetched when a group is opened, moved by READ_WATERMARK
  // events, and only ever forward. Private chats keep their receipts instead.
  const [readWatermarks, setReadWatermarks] = useState({});
  const handleReadWatermark = (event) => {
    if (!event || event.conversationId == null || event.userId == null) return;
    const mark = Number(event.lastReadMessageId);
    if (!Number.isFinite(mark)) return;
    setReadWatermarks((prev) => {
      const key = String(event.conversationId);
      const current = prev[key] || {};
      if (Number(current[String(event.userId)] || 0) >= mark) return prev;
      return { ...prev, [key]: { ...current, [String(event.userId)]: mark } };
    });
  };
  const loadReadWatermarks = useCallback(async (conversationId) => {
    try {
      const fresh = await getGroupReadWatermarks(conversationId);
      setReadWatermarks((prev) => {
        const key = String(conversationId);
        // An event may have landed while the fetch was in flight; the higher wins.
        const merged = { ...fresh };
        for (const [userId, mark] of Object.entries(prev[key] || {})) {
          if (Number(mark) > Number(merged[userId] || 0)) merged[userId] = mark;
        }
        return { ...prev, [key]: merged };
      });
    } catch (err) {
      console.error("❌ Failed to load read watermarks:", err);
    }
  }, []);

  useEffect(() => {
    if (userReady && user?.id && user?.verifiedUser) {
      fetchInitialData();
    } else if (userReady) {
      resetChat();
    }
  }, [userReady, user?.id, user?.verifiedUser]);

  useEffect(() => {
    if (!user) {
      resetChat(); // Clear chat when user logs out
    }
  }, [user]);  
  
  const resetChat = () => {
    setConversations([]);
    setReadWatermarks({});
    setTopicUnread(0);
    setLoading(false);
  };
  

  const fetchConversations = async (prefetchedConversations = null) => {
    if (!user?.id || !user?.verifiedUser) return;
    const requestedSessionKey = String(user.id);
    try {
      setLoading(true);
      const fetched = Array.isArray(prefetchedConversations)
        ? prefetchedConversations
        : await getConversations(user.id);

      // Messages committed after this point arrive live on the topic; anything
      // older is covered by the history page a conversation loads when opened.
      fetched.forEach((conv) => {
        if (conv.conversationType === "group") {
          subscribeToConversation(conv.conversationId);
        }
      });

      if (socialSessionKeyRef.current !== requestedSessionKey) return;
      // History is loaded lazily per conversation (see ensureHistoryLoaded) —
      // the list itself renders from the server-computed lastMessage/unreadCount,
      // so app start costs ONE request instead of one per conversation, and a
      // backend restart no longer triggers a reconnect stampede of history calls.
      // A refresh keeps whatever history is already loaded in this session.
      setConversations((prev) => {
        const prevById = new Map(prev.map((c) => [String(c.conversationId), c]));
        return fetched.map((conv) => {
          const existing = prevById.get(String(conv.conversationId));
          if (!existing?.historyLoaded) return conv;
          return {
            ...conv,
            historyLoaded: true,
            chatHistory: existing.chatHistory,
            oldestCursor: existing.oldestCursor,
            hasMoreHistory: existing.hasMoreHistory,
          };
        });
      });
    } catch (err) {
      console.error("❌ Failed to fetch conversations:", err);
    } finally {
      if (socialSessionKeyRef.current === requestedSessionKey) {
        setLoading(false);
      }
    }
  };

  const fetchInitialData = async (prefetchedConversations = null) => {
    await fetchConversations(prefetchedConversations);
  };

  // Tracks in-flight scroll-back loads so concurrent onEndReached calls coalesce.
  const loadingOlderRef = useRef(new Set());

  // Tracks in-flight first-page loads so a re-rendering ChatPage doesn't refetch.
  const loadingHistoryRef = useRef(new Set());

  /**
   * Loads a conversation's newest history page the first time it is opened.
   *
   * `historyLoaded` — not the presence of chatHistory — is the signal: live
   * WebSocket messages already accumulate in chatHistory before any page was
   * fetched, and they must survive the merge (dedupe keeps one copy).
   * After seeding a private conversation, delivery receipts go out for the page
   * ("delivered on open"); live messages keep receipting via handleWebSocketMessage.
   */
  const ensureHistoryLoaded = async (conversationId, conversationType) => {
    const key = String(conversationId);
    if (loadingHistoryRef.current.has(key)) return;
    loadingHistoryRef.current.add(key);
    try {
      const page = await getChatHistory(conversationId, conversationType, null, 30);
      const messages = page?.messages || [];
      let seeded = null;
      setConversations((prev) =>
        prev.map((c) => {
          if (String(c.conversationId) !== key) return c;
          if (c.historyLoaded) return c; // someone else won the race
          seeded = {
            ...c,
            historyLoaded: true,
            chatHistory: dedupeMessagesById([...messages, ...(c.chatHistory || [])]),
            oldestCursor: page?.nextCursor ?? null,
            hasMoreHistory: Boolean(page?.hasMore),
          };
          return seeded;
        })
      );
      if (seeded && seeded.conversationType === "private") {
        markMessagesAsDelivered(seeded);
      }
    } catch (err) {
      console.error("❌ Failed to load conversation history:", err);
    } finally {
      loadingHistoryRef.current.delete(key);
    }
  };

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
          // A re-broadcast of a message already here (an edit, or new reaction
          // tallies): take the server's fields, but a broadcast cannot know which
          // reactions are this device's own, so that part is kept from before.
          chatHistory[exists] = {
            ...chatHistory[exists],
            ...message,
            reactions: mergeReactions(chatHistory[exists].reactions, message.reactions),
            poll: mergePoll(chatHistory[exists].poll, message.poll),
            pending: false,
            failed: false,
          };
        }

        chatHistory = dedupeMessagesById(chatHistory);

        // A genuinely new message from someone else bumps the unread badge live;
        // it resets to 0 when the conversation is viewed (see ChatPage read effect).
        // A recall of a message that was never loaded here looks new too; it is not.
        const isNewIncoming =
          String(message.senderId) !== String(user?.id) &&
          !message.deleted &&
          !message.recalled &&
          exists === -1 &&
          optimisticIndex === -1;

        const mentionsCurrentUser =
          isNewIncoming &&
          (Boolean(message.mentionsEveryone) ||
            (message.mentionedUserIds || []).some(
              (mentionedUserId) => String(mentionedUserId) === String(user?.id)
            ));

        // Group delivery/read receipts are intentionally not tracked. Group
        // messages use the shared topic and REST read watermark instead.
        if (
          conv.conversationType === "private" &&
          String(message.senderId) !== String(user?.id) &&
          !message.deleted
        ) {
          sendDeliveryStatusUpdate({
            messageId: message.messageId,
            conversationId: message.conversationId,
            conversationType: conv.conversationType,
            senderId: message.senderId,
            deliveryStatus: { [user.id]: "DELIVERED" },
          });
        }

        // Keep the list row's preview current. The incoming payload has the same
        // field shape as the server's lastMessage, so it can stand in directly:
        // replace on a newer (or same, i.e. edited) message; on a delete of the
        // current preview, fall back to the loaded tail.
        let lastMessage = conv.lastMessage;
        if (message.deleted) {
          if (lastMessage?.messageId === message.messageId) {
            lastMessage = chatHistory.length ? chatHistory[chatHistory.length - 1] : null;
          }
        } else if (!lastMessage || Number(message.messageId) >= Number(lastMessage.messageId)) {
          lastMessage = message;
        }

        return {
          ...conv,
          chatHistory,
          lastMessage,
          unreadCount: (conv.unreadCount || 0) + (isNewIncoming ? 1 : 0),
          mentioned: Boolean(conv.mentioned || mentionsCurrentUser),
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
        // A brand-new conversation is usually opened right away, so one page here
        // spares the open a fetch; it also feeds markMessagesAsDelivered below.
        const page = await getChatHistory(enriched.conversationId, enriched.conversationType, null, 30);
        enriched.chatHistory = page?.messages || [];
        enriched.oldestCursor = page?.nextCursor ?? null;
        enriched.hasMoreHistory = Boolean(page?.hasMore);
        enriched.historyLoaded = true;
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
    if (conv.conversationType !== "private" || !conv.chatHistory?.length) return;
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

  // Unread across every conversation, driving the tab badge and the OS app-icon
  // badge. Muted conversations are left out — they still show their own row badge
  // in the chat list, they just don't demand attention app-wide.
  const totalUnread = useMemo(
    () =>
      conversations.reduce(
        (sum, conv) => (conv?.muted ? sum : sum + (conv?.unreadCount || 0)),
        0
      ),
    [conversations]
  );

  /**
   * Unseen replies in topics this user follows.
   *
   * Threads are not conversations, but the Topics row lives in the chat list, so
   * its badge belongs with the rest of that list's state. Zero for anyone who
   * follows nothing, which is everybody by default.
   */
  const [topicUnread, setTopicUnread] = useState(0);

  const refreshTopicUnread = useCallback(async () => {
    setTopicUnread(await getTopicUnreadCount());
  }, []);

  // Muting is toggled from the chat header; patching it here makes the badge react
  // at once instead of waiting for the next conversation refetch.
  const setConversationMuted = (conversationId, muted) => {
    setConversations((prev) =>
      prev.map((conv) =>
        String(conv.conversationId) === String(conversationId)
          ? { ...conv, muted }
          : conv
      )
    );
  };

  // Pinning to the top is toggled from the list row; patching it here reorders
  // the list at once rather than on the next refetch.
  const setConversationPinned = (conversationId, pinned) => {
    setConversations((prev) =>
      prev.map((conv) =>
        String(conv.conversationId) === String(conversationId)
          ? { ...conv, pinned, pinnedAt: pinned ? Date.now() : null }
          : conv
      )
    );
  };

  // A group admin pinned or removed the group notice. Arrives on the group
  // topic (one send reaches the whole church-wide group), routed here by
  // eventType like moderation events are.
  const handleGroupNoticeUpdate = (payload) => {
    if (payload?.conversationId == null) return;
    setConversations((prev) =>
      prev.map((conv) =>
        String(conv.conversationId) === String(payload.conversationId)
          ? { ...conv, notice: payload.notice || null }
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
        totalUnread,
        topicUnread,
        refreshTopicUnread,
        resetChat,
        setConversations,
        setConversationMuted,
        setConversationPinned,
        drafts,
        draftsLoaded,
        saveDraft,
        readWatermarks,
        loadReadWatermarks,
        handleReadWatermark,
        fetchInitialData,
        ensureHistoryLoaded,
        loadOlderMessages,
        handleWebSocketMessage,
        handleUserStatusUpdate,
        handleDeliveryStatusUpdate,
        handleChatUpdate,
        handleParticipantUpdate,
        handleGroupAdminUpdate,
        handleGroupIconUpdate,
        handleGroupNoticeUpdate,
        handleModerationEvent,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
