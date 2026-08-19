package com.fyp.backend.config.websocket;

import com.fyp.backend.service.RedisService;
import com.fyp.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Component
public class WebSocketEventListener {

    @Autowired
    private RedisService redisService;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @Autowired private UserRepository userRepository;

    /**
     * Marks the connecting device online and broadcasts "online" only on the
     * offline->online TRANSITION. Reconnect churn used to broadcast on every
     * connect — one flaky phone on a train notified every open client each time
     * its socket came back. The was-online question works because the handshake
     * interceptor no longer marks presence itself; this listener is the first
     * writer for the session.
     */
    @EventListener
    public void handleWebSocketConnectListener(SessionConnectEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        String email = (String) headerAccessor.getSessionAttributes().get("userEmail");
        String deviceId = (String) headerAccessor.getSessionAttributes().get("deviceId");

        if (email != null && deviceId != null) {
            boolean wasOnline = redisService.isUserOnlineAnywhere(email);
            redisService.setUserOnline(email, deviceId);
            if (!wasOnline) {
                broadcastUserStatus(email, "online");
            }
        }
    }

    /**
     * Handle WebSocket disconnect: mark user as "offline" for that specific device,
     * and notify if the user is offline everywhere (no devices online).
     */
    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        String email = (String) headerAccessor.getSessionAttributes().get("userEmail");
        String deviceId = (String) headerAccessor.getSessionAttributes().get("deviceId");

        if (email != null && deviceId != null) {
            redisService.setDeviceOffline(email, deviceId); // Mark the specific device as offline

            // If user has no devices online anywhere, broadcast "offline"
            if (!redisService.isUserOnlineAnywhere(email)) {
                broadcastUserStatus(email, "offline");
            }
        }
    }

    /**
     * Broadcast user status (online/offline) to the frontend, keyed by user id so
     * clients never need emails to track presence. Presence stays email-keyed in
     * Redis; we resolve the id only at broadcast time.
     */
    private void broadcastUserStatus(String userEmail, String status) {
        Long userId = userRepository.findByEmail(userEmail).map(u -> u.getId()).orElse(null);
        if (userId == null) {
            return;
        }
        messagingTemplate.convertAndSend("/user/queue/status",
                "{ \"userId\": \"" + userId + "\", \"status\": \"" + status + "\" }");
    }
}
