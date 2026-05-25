//package com.fyp.backend.controller;
//
//import com.fyp.backend.service.PushNotificationService;
//import org.springframework.beans.factory.annotation.Autowired;
//import org.springframework.http.ResponseEntity;
//import org.springframework.web.bind.annotation.*;
//
//@RestController
//@RequestMapping("/api/push-notifications")
//public class PushNotificationController {
//
//    @Autowired
//    private PushNotificationService pushNotificationService;
//
//    // Register a push token
//    @PostMapping("/register")
//    public ResponseEntity<?> registerPushToken(
//            @RequestParam Long userId,
//            @RequestParam String token,
//            @RequestParam String deviceType) {
//        pushNotificationService.registerPushToken(userId, token, deviceType);
//        return ResponseEntity.ok("Push token registered successfully");
//    }
//
//    // Deactivate a push token
//    @PostMapping("/deactivate")
//    public ResponseEntity<?> deactivatePushToken(
//            @RequestParam Long userId,
//            @RequestParam String token) {
//        pushNotificationService.deactivatePushToken(userId, token);
//        return ResponseEntity.ok("Push token deactivated successfully");
//    }
//
//    // Unregister a push token
//    @DeleteMapping("/unregister")
//    public ResponseEntity<?> unregisterPushToken(
//            @RequestParam Long userId,
//            @RequestParam String token) {
//        pushNotificationService.unregisterPushToken(userId, token);
//        return ResponseEntity.ok("Push token unregistered successfully");
//    }
//
//    // Send a push notification to a user (for testing purposes)
//    @PostMapping("/send")
//    public ResponseEntity<?> sendPushNotification(
//            @RequestParam Long userId,
//            @RequestParam String message) {
//        pushNotificationService.sendPushNotification(userId, message);
//        return ResponseEntity.ok("Push notification sent");
//    }
//}

package com.fyp.backend.controller;

import com.fyp.backend.service.PushNotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/push-notifications")
public class PushNotificationController {

    @Autowired
    private PushNotificationService pushNotificationService;

    // Register a push token when user registers
    @PostMapping("/register")
    public ResponseEntity<?> registerPushTokenForNewUser(
            @RequestParam Long userId,
            @RequestParam String token,
            @RequestParam String deviceType,
            @RequestParam String deviceId) {
        // Decode the token
        String decodedToken = URLDecoder.decode(token, StandardCharsets.UTF_8);
        // Register the push token with the new user and set it inactive
        pushNotificationService.registerPushTokenForNewUser(userId, decodedToken, deviceType, deviceId);
        return ResponseEntity.ok("Push token registered successfully (inactive for new user)");
    }

    // Handle push token registration on user login (activate token)
    @PostMapping("/login")
    public ResponseEntity<?> registerPushTokenForLogin(
            @RequestParam Long userId,
            @RequestParam String token,
            @RequestParam String deviceType,
            @RequestParam String deviceId) {
        // Decode the token
        String decodedToken = URLDecoder.decode(token, StandardCharsets.UTF_8);
        // Register the push token and set it active (or re-activate if needed)
        pushNotificationService.registerPushTokenForLogin(userId, decodedToken, deviceType, deviceId);
        return ResponseEntity.ok("Push token registered successfully (active for logged-in user)");
    }

    // Deactivate a push token
    @PostMapping("/deactivate")
    public ResponseEntity<?> deactivatePushToken(
            @RequestParam Long userId,
            @RequestParam String token) {
        // Decode the token
        String decodedToken = URLDecoder.decode(token, StandardCharsets.UTF_8);
        pushNotificationService.deactivatePushToken(userId, decodedToken);
        return ResponseEntity.ok("Push token deactivated successfully");
    }

    // Unregister a push token
    @DeleteMapping("/unregister")
    public ResponseEntity<?> unregisterPushToken(
            @RequestParam Long userId,
            @RequestParam String token) {
        // Decode the token
        String decodedToken = URLDecoder.decode(token, StandardCharsets.UTF_8);
        pushNotificationService.unregisterPushToken(userId, decodedToken);
        return ResponseEntity.ok("Push token unregistered successfully");
    }

    // Send a push notification to a user (for testing purposes)
//    @PostMapping("/send")
//    public ResponseEntity<?> sendPushNotification(
//            @RequestParam Long userId,
//            @RequestParam String message) {
//        pushNotificationService.sendPushNotification(userId, message);
//        return ResponseEntity.ok("Push notification sent");
//    }
}
