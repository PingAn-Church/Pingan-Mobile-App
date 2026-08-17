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

    /** A member the chat surface is open to. */
    private User verifiedUser(long id) {
        User user = new User();
        user.setId(id);
        user.setVerifiedUser(true);
        return user;
    }

    /** Signed in, but an admin has not approved them yet. */
    private User unverifiedUser(long id) {
        User user = new User();
        user.setId(id);
        user.setVerifiedUser(false);
        return user;
    }

    @Test
    void allowsAuthenticatedModerationSubscription() {
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(verifiedUser(7L)));

        Message<?> message = subscribe("/topic/content-moderation", "user@example.com");

        assertNotNull(interceptor.preSend(message, channel));
    }

    @Test
    void anUnverifiedAccountMaySubscribeToItsOwnPermissionFeed() {
        // The only thing it may reach, and the reason it is allowed a socket at
        // all: this is how being approved arrives without a poll or a sign-in.
        when(userRepository.findByEmail("new@example.com")).thenReturn(Optional.of(unverifiedUser(9L)));

        assertNotNull(interceptor.preSend(
                subscribe("/user/9/queue/permissions", "new@example.com"), channel));
    }

    @Test
    void anUnverifiedAccountMayReachNothingElse() {
        when(userRepository.findByEmail("new@example.com")).thenReturn(Optional.of(unverifiedUser(9L)));

        // Its own queues, the presence broadcast and moderation all stay closed
        // until an admin approves it — exactly as when the socket was verified-only.
        assertNull(interceptor.preSend(subscribe("/user/9/queue/messages", "new@example.com"), channel));
        assertNull(interceptor.preSend(subscribe("/user/9/queue/conversations", "new@example.com"), channel));
        assertNull(interceptor.preSend(subscribe("/user/queue/status", "new@example.com"), channel));
        assertNull(interceptor.preSend(subscribe("/topic/content-moderation", "new@example.com"), channel));
    }

    @Test
    void nobodyMaySubscribeToSomebodyElsesPermissionFeed() {
        when(userRepository.findByEmail("new@example.com")).thenReturn(Optional.of(unverifiedUser(9L)));

        assertNull(interceptor.preSend(
                subscribe("/user/10/queue/permissions", "new@example.com"), channel));
    }

    @Test
    void aVerifiedAccountKeepsItsOwnQueuesAndThePresenceBroadcast() {
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(verifiedUser(7L)));

        assertNotNull(interceptor.preSend(subscribe("/user/7/queue/messages", "user@example.com"), channel));
        assertNotNull(interceptor.preSend(subscribe("/user/7/queue/permissions", "user@example.com"), channel));
        assertNotNull(interceptor.preSend(subscribe("/user/queue/status", "user@example.com"), channel));
        // Still not somebody else's.
        assertNull(interceptor.preSend(subscribe("/user/8/queue/messages", "user@example.com"), channel));
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
