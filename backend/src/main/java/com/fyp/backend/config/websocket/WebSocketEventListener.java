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

//    /**

    /**
     * Handle WebSocket connection: mark user as "online" for that specific device,
     * and broadcast if it's their first device online.
     */
    @EventListener
    public void handleWebSocketConnectListener(SessionConnectEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        String email = (String) headerAccessor.getSessionAttributes().get("userEmail");
        String deviceId = (String) headerAccessor.getSessionAttributes().get("deviceId");

        if (email != null && deviceId != null) {

            // Check if the user already has any devices online before setting the current device online
            boolean isFirstDeviceOnline = !redisService.isUserOnlineAnywhere(email);

//            System.out.println("ONLINE ANYWHERE" + isFirstDeviceOnline);
//
//            // If this is the first device connecting, broadcast the user's online status
            // Note that WebSocketInterceptor sets it online first, hence this doenst work.
//            if (isFirstDeviceOnline) {
//                broadcastUserStatus(email, "online");
//            }

            broadcastUserStatus(email, "online");

            // Now, set this device as online
            redisService.setUserOnline(email, deviceId);
            System.out.println("✅ User online: " + email + " (Device: " + deviceId + ")");
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
            System.out.println("❌ User offline: " + email + " (Device: " + deviceId + ")");

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
