package com.fyp.backend.service;

import java.util.ArrayList;
import java.util.List;

import com.fyp.backend.dto.MessageDto;

/**
 * Where a message's WebSocket copies go: the conversation topic for a group,
 * each participant's own queue for a private chat. One place for the rule, so a
 * reaction update lands exactly where the message it changes did.
 */
public final class ChatDestinations {

    private ChatDestinations() {
    }

    public static List<String> forMessage(String conversationType, MessageDto message) {
        List<String> destinations = new ArrayList<>();

        if ("group".equals(conversationType)) {
            // For group conversations, send to the conversation topic
            destinations.add("/topic/conversation-" + message.getConversationId());
        } else if ("private".equals(conversationType)) {
            // For private conversations, send to both the sender and each recipient
            destinations.add("/user/" + message.getSenderId() + "/queue/messages"); // To the sender

            // To the recipients
            for (Long recipientId : message.getRecipientIds()) {
                destinations.add("/user/" + recipientId + "/queue/messages");
            }
        }

        return destinations;
    }
}
