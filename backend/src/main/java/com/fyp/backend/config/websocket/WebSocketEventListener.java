//package com.fyp.backend.config.websocket;
//
//import com.fyp.backend.mq.ManualMessageConsumer;
//import com.fyp.backend.service.RedisService;
//import org.springframework.beans.factory.annotation.Autowired;
//import org.springframework.context.event.EventListener;
//import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
//import org.springframework.messaging.simp.SimpMessagingTemplate;
//import org.springframework.stereotype.Component;
//import org.springframework.web.socket.messaging.SessionConnectEvent;
//import org.springframework.web.socket.messaging.SessionDisconnectEvent;
//
//@Component
//public class WebSocketEventListener {
//
//    @Autowired
//    private RedisService redisService;
//
//    @Autowired
//    private SimpMessagingTemplate messagingTemplate; // ✅ Broadcast status updates
//
//    @Autowired private ManualMessageConsumer messageConsumer;
//
//    /**
//     * ✅ Handle WebSocket connection: mark user as "online".
//     */
//    @EventListener
//    public void handleWebSocketConnectListener(SessionConnectEvent event) {
//        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
//        String userEmail = (String) headerAccessor.getSessionAttributes().get("userEmail");
//
//        if (userEmail != null) {
//            redisService.setUserOnline(userEmail);
//            System.out.println("✅ User online: " + userEmail);
//            broadcastUserStatus(userEmail, "online");
//        }
//    }
//
//    /**
//     * ✅ Handle WebSocket disconnect: mark user as "offline".
//     */
//    @EventListener
//    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
//        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
//        String userEmail = (String) headerAccessor.getSessionAttributes().get("userEmail");
//
//        if (userEmail != null) {
//            redisService.setUserOffline(userEmail);
//            System.out.println("❌ User offline: " + userEmail);
//            broadcastUserStatus(userEmail, redisService.getUserStatus(userEmail));
//        }
//    }
//
//    /**
//     * ✅ Broadcast user status updates to frontend.
//     */
//    private void broadcastUserStatus(String userEmail, String status) {
//        messagingTemplate.convertAndSend("/user/queue/status", "{ \"userEmail\": \"" + userEmail + "\", \"status\": \"" + status + "\" }");
//    }
//}

package com.fyp.backend.config.websocket;

import com.fyp.backend.service.RedisService;
import com.fyp.backend.mq.ManualMessageConsumer;
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

    @Autowired private ManualMessageConsumer messageConsumer;

//    /**
//     * Handle WebSocket connection: mark user as "online" for that specific device,
//     * and broadcast if it's their first device online.
//     */
//    @EventListener
//    public void handleWebSocketConnectListener(SessionConnectEvent event) {
//        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
//        String email = (String) headerAccessor.getSessionAttributes().get("userEmail");
//        String deviceId = (String) headerAccessor.getSessionAttributes().get("deviceId");
//
//        if (email != null && deviceId != null) {
//            redisService.setUserOnline(email, deviceId);
//            System.out.println("✅ User online: " + email + " (Device: " + deviceId + ")");
//
//            // Check if the user had any devices online before
//            if (!redisService.isUserOnlineAnywhere(email)) {
//                // If this is the first device, broadcast the user's status as online
//                broadcastUserStatus(email, "online");
//            }
//        }
//    }

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
     * Broadcast user status (online/offline) to frontend.
     */
    private void broadcastUserStatus(String userEmail, String status) {
        messagingTemplate.convertAndSend("/user/queue/status",
                "{ \"userEmail\": \"" + userEmail + "\", \"status\": \"" + status + "\" }");
    }
}
