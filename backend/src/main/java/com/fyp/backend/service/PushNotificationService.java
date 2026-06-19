//package com.fyp.backend.service;
//
//import com.fyp.backend.model.PushToken;
//import com.fyp.backend.model.User;
//import com.fyp.backend.repository.PushTokenRepository;
//import com.fyp.backend.repository.UserRepository;
//import org.springframework.beans.factory.annotation.Autowired;
//import org.springframework.stereotype.Service;
//
//import java.util.List;
//
//@Service
//public class PushNotificationService {
//
//    @Autowired
//    private PushTokenRepository pushTokenRepository;
//    @Autowired
//    private UserRepository userRepository;
//
//    // Register a push token for a user and device
//    public PushToken registerPushToken(Long userId, String token, String deviceType) {
//        // Fetch the user based on userId
//        User user = userRepository.findById(userId)
//                .orElseThrow(() -> new RuntimeException("User not found"));
//
//        // Create a new PushToken object and set values
//        PushToken pushToken = new PushToken();
//        pushToken.setUser(user);  // Set the fetched user entity here
//        pushToken.setToken(token);
//        pushToken.setDeviceType(deviceType);
//
//        // Save and return the push token
//        return pushTokenRepository.save(pushToken);
//    }
//
//    // Deactivate a push token (e.g., for logging out or user preferences)
//    public PushToken deactivatePushToken(Long userId, String token) {
//        PushToken pushToken = pushTokenRepository.findByUserIdAndToken(userId, token)
//                .orElseThrow(() -> new RuntimeException("Token not found"));
//
//        pushToken.setActive(false);
//        return pushTokenRepository.save(pushToken);
//    }
//
//    // Unregister a push token (e.g., app uninstalled)
//    public void unregisterPushToken(Long userId, String token) {
//        pushTokenRepository.deleteByUserIdAndToken(userId, token);
//    }
//
//    // Send push notifications to all devices associated with the user
//    public void sendPushNotification(Long userId, String message) {
//        List<PushToken> tokens = pushTokenRepository.findByUserId(userId);
//
//        // Use a push notification service to send notifications to the tokens (e.g., Firebase, Expo)
//        for (PushToken pushToken : tokens) {
//            if (pushToken.isActive()) {
//                // Call your push notification service to send the message
//                // Example: sendToDevice(pushToken.getToken(), message);
//            }
//        }
//    }
//}


//package com.fyp.backend.service;
//
//import com.fyp.backend.model.PushToken;
//import com.fyp.backend.model.User;
//import com.fyp.backend.repository.PushTokenRepository;
//import com.fyp.backend.repository.UserRepository;
//import org.springframework.beans.factory.annotation.Autowired;
//import org.springframework.stereotype.Service;
//
//import java.util.List;
//import java.util.Optional;
//
//@Service
//public class PushNotificationService {
//
//    @Autowired
//    private PushTokenRepository pushTokenRepository;
//
//    @Autowired
//    private UserRepository userRepository;
//
//    // Register a push token for a user and device
//    public PushToken registerPushToken(Long userId, String token, String deviceType) {
//        // Fetch the user based on userId
//        User user = userRepository.findById(userId)
//                .orElseThrow(() -> new RuntimeException("User not found"));
//
//        // Check if the token already exists for this user
//        Optional<PushToken> existingPushToken = pushTokenRepository.findByUserIdAndToken(userId, token);
//
//        // If the token exists, update it or simply reactivate it if inactive
//        if (existingPushToken.isPresent()) {
//            PushToken pushToken = existingPushToken.get();
//            // If the token is inactive, reactivate it
//            if (!pushToken.isActive()) {
//                pushToken.setActive(true);
//                pushToken.setDeviceType(deviceType);  // Update device type if needed
//                return pushTokenRepository.save(pushToken);
//            }
//            // If active, simply return the existing token
//            return pushToken;
//        }
//
//        // If the token doesn't exist, create a new PushToken and save it
//        PushToken pushToken = new PushToken();
//        pushToken.setUser(user);  // Set the fetched user entity here
//        pushToken.setToken(token);
//        pushToken.setDeviceType(deviceType);
//
//        // Save and return the push token
//        return pushTokenRepository.save(pushToken);
//    }
//
//    // Deactivate a push token (e.g., for logging out or user preferences)
//    public PushToken deactivatePushToken(Long userId, String token) {
//        PushToken pushToken = pushTokenRepository.findByUserIdAndToken(userId, token)
//                .orElseThrow(() -> new RuntimeException("Token not found"));
//
//        pushToken.setActive(false);
//        return pushTokenRepository.save(pushToken);
//    }
//
//    // Unregister a push token (e.g., app uninstalled)
//    public void unregisterPushToken(Long userId, String token) {
//        pushTokenRepository.deleteByUserIdAndToken(userId, token);
//    }
//
//    // Send push notifications to all devices associated with the user
//    public void sendPushNotification(Long userId, String message) {
//        List<PushToken> tokens = pushTokenRepository.findByUserId(userId);
//
//        // Use a push notification service to send notifications to the tokens (e.g., Firebase, Expo)
//        for (PushToken pushToken : tokens) {
//            if (pushToken.isActive()) {
//                // Call your push notification service to send the message
//                // Example: sendToDevice(pushToken.getToken(), message);
//            }
//        }
//    }
//}

package com.fyp.backend.service;

import com.fyp.backend.model.PushToken;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.PushTokenRepository;
import com.fyp.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Optional;

@Service
public class PushNotificationService {

    @Autowired
    private PushTokenRepository pushTokenRepository;

    @Autowired
    private UserRepository userRepository;

    private final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

    // Register a push token for a new user (inactive initially)
//    public PushToken registerPushTokenForNewUser(Long userId, String token, String deviceType) {
//        // Fetch the user based on userId
//        User user = userRepository.findById(userId)
//                .orElseThrow(() -> new RuntimeException("User not found"));
//
//        // Check if the token already exists for this user
//        Optional<PushToken> existingPushToken = pushTokenRepository.findByUserIdAndToken(userId, token);
//
//        // If the token exists, just return it (inactive)
//        if (existingPushToken.isPresent()) {
//            return existingPushToken.get();  // No need to modify, as it’s inactive
//        }
//
//        // If the token doesn't exist, create a new PushToken and set it inactive
//        PushToken pushToken = new PushToken();
//        pushToken.setUser(user);
//        pushToken.setToken(token);
//        pushToken.setDeviceType(deviceType);
//        pushToken.setActive(false);  // Inactive by default on registration
//
//        return pushTokenRepository.save(pushToken);
//    }

    // Register a push token for a new user (inactive initially)
    public PushToken registerPushTokenForNewUser(Long userId, String token, String deviceType, String deviceId) {
        // Fetch the user based on userId
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Check if the token already exists for this user and deviceId
        Optional<PushToken> existingPushToken = pushTokenRepository.findByUserIdAndTokenAndDeviceId(userId, token, deviceId);

        // If the token exists, just return it (inactive)
        if (existingPushToken.isPresent()) {
            return existingPushToken.get();  // No need to modify, as it’s inactive
        }

        // If the token doesn't exist, create a new PushToken and set it inactive
        PushToken pushToken = new PushToken();
        pushToken.setUser(user);
        pushToken.setToken(token);
        pushToken.setDeviceType(deviceType);
        pushToken.setDeviceId(deviceId);  // Store the deviceId
        pushToken.setActive(false);  // Inactive by default on registration

        return pushTokenRepository.save(pushToken);
    }

    // Register a push token for a user logging in (set it active if not already)
//    public PushToken registerPushTokenForLogin(Long userId, String token, String deviceType) {
//        // Fetch the user based on userId
//        User user = userRepository.findById(userId)
//                .orElseThrow(() -> new RuntimeException("User not found"));
//
//        // Check if the token already exists for this user
//        Optional<PushToken> existingPushToken = pushTokenRepository.findByUserIdAndToken(userId, token);
//
//        if (existingPushToken.isPresent()) {
//            PushToken pushToken = existingPushToken.get();
//            // If the token is inactive, reactivate it
//            if (!pushToken.isActive()) {
//                pushToken.setActive(true);
//                pushToken.setDeviceType(deviceType);  // Update device type if needed
//                return pushTokenRepository.save(pushToken);
//            }
//            // If active, simply return the existing token
//            return pushToken;
//        }
//
//        // If the token doesn't exist, create a new PushToken and set it active
//        PushToken pushToken = new PushToken();
//        pushToken.setUser(user);
//        pushToken.setToken(token);
//        pushToken.setDeviceType(deviceType);
//        pushToken.setActive(true);  // Active after login
//
//        return pushTokenRepository.save(pushToken);
//    }

    // Register a push token for a user logging in (set it active if not already)
    public PushToken registerPushTokenForLogin(Long userId, String token, String deviceType, String deviceId) {
        // Fetch the user based on userId
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Check if the token already exists for this user and deviceId
        Optional<PushToken> existingPushToken = pushTokenRepository.findByUserIdAndTokenAndDeviceId(userId, token, deviceId);

        System.out.println("EXISTS??" + existingPushToken.isPresent());

        if (existingPushToken.isPresent()) {
            PushToken pushToken = existingPushToken.get();
            // If the token is inactive, reactivate it
            if (!pushToken.isActive()) {
                pushToken.setActive(true);
                pushToken.setDeviceType(deviceType);  // Update device type if needed
                pushToken.setDeviceId(deviceId);  // Update deviceId if needed
                return pushTokenRepository.save(pushToken);
            }
            // If active, simply return the existing token
            return pushToken;
        }

        // If the token doesn't exist, create a new PushToken and set it active
        PushToken pushToken = new PushToken();
        pushToken.setUser(user);
        pushToken.setToken(token);
        pushToken.setDeviceType(deviceType);
        pushToken.setDeviceId(deviceId);  // Store the deviceId
        pushToken.setActive(true);  // Active after login

        return pushTokenRepository.save(pushToken);
    }

    // Deactivate a push token (e.g., for logging out or user preferences)
    public PushToken deactivatePushToken(Long userId, String token) {
        PushToken pushToken = pushTokenRepository.findByUserIdAndToken(userId, token)
                .orElseThrow(() -> new RuntimeException("Token not found"));

        pushToken.setActive(false);
        return pushTokenRepository.save(pushToken);
    }

    // Unregister a push token (e.g., app uninstalled)
    public void unregisterPushToken(Long userId, String token) {
        pushTokenRepository.deleteByUserIdAndToken(userId, token);
    }

    // Send push notifications to all devices associated with the user
//    public void sendPushNotification(Long userId, String message) {
//        List<PushToken> tokens = pushTokenRepository.findByUserId(userId);
//
//        // Use a push notification service to send notifications to the tokens (e.g., Firebase, Expo)
//        for (PushToken pushToken : tokens) {
//            if (pushToken.isActive()) {
//                // Call your push notification service to send the message
//                // Example: sendToDevice(pushToken.getToken(), message);
//            }
//        }
//    }

//    // Send push notifications to all devices associated with the user
//    public void sendPushNotification(List<Long> recipientIds, String message, String title) {
//        for (Long userId : recipientIds) {
//            List<PushToken> tokens = pushTokenRepository.findByUserId(userId);
//            for (PushToken token : tokens) {
//                // Only send notification if the token is active
//                if (token.isActive()) {
//                    sendPushToDevice(token.getToken(), message, title);  // Send notification to device
//                }
//            }
//        }
//    }
//
//    // Send push notification to a single device via Expo Push API
//    private void sendPushToDevice(String token, String message, String title) {
//        try {
//            RestTemplate restTemplate = new RestTemplate();
//            // Prepare push notification request
//            String requestBody = "{\n" +
//                    "  \"to\": \"" + token + "\",\n" +
//                    "  \"title\": \"" + title + "\",\n" +
//                    "  \"body\": \"" + message + "\"\n" +
//                    "}";
//
//            // Make the request to Expo Push API
//            restTemplate.postForObject(EXPO_PUSH_URL, requestBody, String.class);
//        } catch (Exception e) {
//            e.printStackTrace();
//        }
//    }

    /**
     * Sends a learning-related push (enrolment, quiz result, course completion,
     * achievement, certificate) to a single user, reusing the Expo delivery path.
     * Best-effort: any delivery failure is swallowed so it never breaks the
     * learning flow that triggered it.
     */
    public void notifyLearningEvent(Long userId, String title, String message) {
        if (userId == null) return;
        try {
            sendPushNotification(List.of(userId), message, title, null, "learning");
        } catch (Exception ignored) {
            // best-effort notification; never disrupt the originating action
        }
    }

    /**
     * Quiz-graded push that deep-links the learner to the quiz results screen.
     * The quiz id rides on the existing conversationId field, tagged with the
     * "quiz-graded" type so the app routes it to results rather than chat.
     */
    public void notifyQuizGraded(Long userId, String title, String message, Long quizId) {
        if (userId == null) return;
        try {
            sendPushNotification(List.of(userId), message, title, quizId, "quiz-graded");
        } catch (Exception ignored) {
            // best-effort notification; never disrupt the originating action
        }
    }

    // Send push notifications to all devices associated with the user
    public void sendPushNotification(List<Long> recipientIds, String message, String title, Long conversationId, String conversationType) {
        for (Long userId : recipientIds) {
            List<PushToken> tokens = pushTokenRepository.findByUserId(userId);
            for (PushToken token : tokens) {
                // Only send notification if the token is active
                if (token.isActive()) {
                    sendPushToDevice(token.getToken(), message, title, conversationId, conversationType);  // Send notification to device
                }
            }
        }
    }

    // Send push notification to a single device via Expo Push API
    private void sendPushToDevice(String token, String message, String title, Long conversationId, String conversationType) {
        try {
            RestTemplate restTemplate = new RestTemplate();
            // Prepare push notification request with additional data for navigation
            String requestBody = "{\n" +
                    "  \"to\": \"" + token + "\",\n" +
                    "  \"title\": \"" + title + "\",\n" +
                    "  \"body\": \"" + message + "\",\n" +
                    "  \"data\": {\n" +
                    "    \"conversationId\": \"" + conversationId + "\",\n" +
                    "    \"conversationType\": \"" + conversationType + "\"\n" +
                    "  }\n" +
                    "}";

            // Make the request to Expo Push API
            restTemplate.postForObject(EXPO_PUSH_URL, requestBody, String.class);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

}

