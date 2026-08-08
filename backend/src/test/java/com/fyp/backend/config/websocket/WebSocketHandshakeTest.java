package com.fyp.backend.config.websocket;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;

import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.service.RedisService;
import com.fyp.backend.util.JwtUtil;

/**
 * The handshake authenticates; it deliberately does not authorize. Per-destination
 * access is enforced by {@link WebSocketSubscriptionInterceptor}, so an unverified
 * account is allowed to connect — rejecting it only drove older clients into a
 * permanent reconnect loop without withholding anything.
 */
@ExtendWith(MockitoExtension.class)
class WebSocketHandshakeTest {

    @Mock private JwtUtil jwtUtil;
    @Mock private RedisService redisService;
    @Mock private UserRepository userRepository;
    @Mock private ServerHttpRequest request;
    @Mock private ServerHttpResponse response;
    @InjectMocks private WebSocketInterceptor interceptor;

    private Map<String, Object> attributes;

    @BeforeEach
    void setUp() {
        attributes = new HashMap<>();
        lenient().when(request.getURI())
                .thenReturn(URI.create("http://host/ws?token=tok&deviceId=dev-1"));
        lenient().when(jwtUtil.extractEmail("tok")).thenReturn("user@example.com");
        lenient().when(jwtUtil.validateToken("tok", "user@example.com")).thenReturn(true);
    }

    private User account(boolean verified, boolean active, boolean deleted) {
        User user = new User();
        user.setId(7L);
        user.setEmail("user@example.com");
        user.setVerifiedUser(verified);
        user.setActive(active);
        user.setDeletedAccount(deleted);
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));
        return user;
    }

    @Test
    void unverifiedAccountMayStillCompleteTheHandshake() {
        account(false, true, false);

        assertTrue(interceptor.beforeHandshake(request, response, null, attributes));
        assertTrue(attributes.get("userId").equals(7L));
    }

    @Test
    void verifiedAccountCompletesTheHandshake() {
        account(true, true, false);

        assertTrue(interceptor.beforeHandshake(request, response, null, attributes));
    }

    @Test
    void deactivatedAccountIsStillRefused() {
        account(true, false, false);

        assertFalse(interceptor.beforeHandshake(request, response, null, attributes));
    }

    @Test
    void deletedAccountIsStillRefused() {
        account(true, true, true);

        assertFalse(interceptor.beforeHandshake(request, response, null, attributes));
    }

    @Test
    void unknownAccountIsRefused() {
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.empty());

        assertFalse(interceptor.beforeHandshake(request, response, null, attributes));
    }
}
