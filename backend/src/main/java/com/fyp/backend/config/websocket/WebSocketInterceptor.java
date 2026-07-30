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
                if (user != null
                        && user.isActive()
                        && !user.isDeletedAccount()
                        && user.isVerifiedUser()
                        && jwtUtil.validateToken(token, user.getEmail())) {
                    attributes.put("userEmail", email);
                    attributes.put("userId", user.getId());
                    attributes.put("deviceId", deviceId);
                    redisService.setUserOnline(email, deviceId);
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
