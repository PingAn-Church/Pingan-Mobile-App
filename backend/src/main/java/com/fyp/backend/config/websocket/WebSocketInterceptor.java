package com.fyp.backend.config.websocket;

import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.service.RedisService;
import com.fyp.backend.util.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.net.URI;
import java.util.Map;

@Component
public class WebSocketInterceptor implements HandshakeInterceptor {

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private RedisService redisService;

    @Autowired
    private UserRepository userRepository;

    // KNOWN LIMITATION (accepted, 2026-08): the access token rides in the handshake
    // query string because RN WebSocket/SockJS clients cannot set an Authorization
    // header. Query strings can end up in reverse-proxy access logs, so keep those
    // logs private. The clean fix — a short-lived single-use connect ticket fetched
    // over HTTPS — needs a coordinated client+server change and was deliberately
    // deferred; tokens expire after 15 minutes, which bounds the exposure.
    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Map<String, Object> attributes) {
        URI uri = request.getURI();
        String query = uri.getQuery(); // token=...&deviceId=...

        if (query != null) {
            String token = null;
            String deviceId = null;
            for (String part : query.split("&")) {
                if (part.startsWith("token=")) token = part.substring(6);
                if (part.startsWith("deviceId=")) deviceId = part.substring(9);
            }

            if (token != null && deviceId != null) {
                String email = jwtUtil.extractEmail(token);
                User user = email == null ? null : userRepository.findByEmail(email).orElse(null);
                // Deliberately NOT gated on isVerifiedUser(). Authorization lives in
                // WebSocketSubscriptionInterceptor, which already restricts every user
                // queue to its owner and every conversation topic to its participants —
                // and an unverified user is a participant of nothing, because
                // ConversationService refuses to put them in a conversation. Rejecting
                // the handshake instead only pushed older clients into a permanent
                // 5-second reconnect loop (they connect for any logged-in user), which
                // cost battery and connections without denying anything extra.
                if (user != null
                        && user.isActive()
                        && !user.isDeletedAccount()
                        && jwtUtil.validateToken(token, user.getEmail())) {
                    attributes.put("userEmail", email);
                    attributes.put("userId", user.getId());
                    attributes.put("deviceId", deviceId);
                    // Presence is deliberately NOT set here. WebSocketEventListener
                    // marks the device online on the CONNECT event, where it can
                    // first ask "was this user online at all?" and broadcast only
                    // the offline->online transition — setting it during the
                    // handshake made that question always answer "yes".
                    return true;
                }
            }
        }
        return false;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Exception exception) {
        // No operation after handshake
    }
}
