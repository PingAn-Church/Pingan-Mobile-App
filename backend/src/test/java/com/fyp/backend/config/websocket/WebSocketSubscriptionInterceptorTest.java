package com.fyp.backend.config.websocket;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.when;

import java.util.HashMap;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;

import com.fyp.backend.model.User;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.PrivateConversationRepository;
import com.fyp.backend.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class WebSocketSubscriptionInterceptorTest {

    @Mock private UserRepository userRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private MessageChannel channel;
    @InjectMocks private WebSocketSubscriptionInterceptor interceptor;

    @Test
    void allowsAuthenticatedModerationSubscription() {
        User user = new User();
        user.setId(7L);
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));

        Message<?> message = subscribe("/topic/content-moderation", "user@example.com");

        assertNotNull(interceptor.preSend(message, channel));
    }

    @Test
    void rejectsAnonymousModerationSubscription() {
        Message<?> message = subscribe("/topic/content-moderation", null);

        assertNull(interceptor.preSend(message, channel));
    }

    @Test
    void allowsOnlyKnownAuthenticatedSendDestinations() {
        assertNotNull(interceptor.preSend(
                frame(StompCommand.SEND, "/app/heartbeat", "user@example.com"), channel));
        assertNull(interceptor.preSend(
                frame(StompCommand.SEND, "/app/participantAdded", "user@example.com"), channel));
        assertNull(interceptor.preSend(
                frame(StompCommand.SEND, "/app/user-ready", null), channel));
    }

    private Message<byte[]> subscribe(String destination, String email) {
        return frame(StompCommand.SUBSCRIBE, destination, email);
    }

    private Message<byte[]> frame(StompCommand command, String destination, String email) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        accessor.setDestination(destination);
        HashMap<String, Object> attributes = new HashMap<>();
        if (email != null) {
            attributes.put("userEmail", email);
        }
        accessor.setSessionAttributes(attributes);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }
}
