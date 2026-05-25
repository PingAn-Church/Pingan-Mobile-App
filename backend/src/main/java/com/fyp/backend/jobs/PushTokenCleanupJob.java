//package com.fyp.backend.jobs;
//
//import com.fyp.backend.model.PushToken;
//import com.fyp.backend.model.User;
//import com.fyp.backend.repository.PushTokenRepository;
//import com.fyp.backend.repository.UserRepository;
//import com.fyp.backend.service.RedisService;
//import jakarta.transaction.Transactional;
//import org.springframework.beans.factory.annotation.Autowired;
//import org.springframework.scheduling.annotation.Scheduled;
//import org.springframework.stereotype.Component;
//
//import java.util.List;
//
//@Component
//public class PushTokenCleanupJob {
//
//    @Autowired
//    private RedisService redisService;
//
//    @Autowired
//    private UserRepository userRepository;
//
//    @Autowired
//    private PushTokenRepository pushTokenRepository;
//
//    /**
//     * Scheduled cleanup: runs daily at 2 AM
//     */
//    @Scheduled(cron = "0 0 2 * * *") // second, minute, hour, day, month, dayOfWeek
////    @Scheduled(cron = "0 * * * * *") // ✅ Runs every minute
//    @Transactional
//    public void cleanupInactivePushTokens() {
//        System.out.println("CLEANING UP PUSH TOKENS");
//        List<User> allUsers = userRepository.findAll();
//
//        for (User user : allUsers) {
//            String email = user.getEmail();
//
//            boolean hasValidRefresh = redisService.hasRefreshToken(email);
//
//            if (!hasValidRefresh) {
//                List<PushToken> tokens = pushTokenRepository.findByUserId(user.getId());
//
//                boolean modified = false;
//                for (PushToken token : tokens) {
//                    if (token.isActive()) {
//                        token.setActive(false);
//                        modified = true;
//                    }
//                }
//
//                if (modified) {
//                    pushTokenRepository.saveAll(tokens);
//                    System.out.println("🔒 Deactivated push tokens for user: " + email);
//                }
//            }
//        }
//    }
//}

//package com.fyp.backend.jobs;
//
//import com.fyp.backend.model.PushToken;
//import com.fyp.backend.model.User;
//import com.fyp.backend.repository.PushTokenRepository;
//import com.fyp.backend.repository.UserRepository;
//import com.fyp.backend.service.RedisService;
//import jakarta.transaction.Transactional;
//import org.springframework.beans.factory.annotation.Autowired;
//import org.springframework.scheduling.annotation.Scheduled;
//import org.springframework.stereotype.Component;
//
//import java.util.List;
//
//@Component
//public class PushTokenCleanupJob {
//
//    @Autowired
//    private RedisService redisService;
//
//    @Autowired
//    private UserRepository userRepository;
//
//    @Autowired
//    private PushTokenRepository pushTokenRepository;
//
//    /**
//     * Scheduled cleanup: runs daily at 2 AM
//     */
//    @Scheduled(cron = "0 0 2 * * *") // second, minute, hour, day, month, dayOfWeek
////    @Scheduled(cron = "0 * * * * *") // ✅ Runs every minute
//    @Transactional
//    public void cleanupInactivePushTokens() {
//        System.out.println("CLEANING UP PUSH TOKENS");
//        List<User> allUsers = userRepository.findAll();
//
//        for (User user : allUsers) {
//            String email = user.getEmail();
//
//            // Check if the user has any valid refresh token associated with any device
//            boolean hasValidRefresh = false;
//            // Assuming that each user has multiple devices, you need to track devices (deviceId)
//            // This assumes you can retrieve deviceId(s) for the user (you may need to adjust based on your actual device management)
//            // You might need a way to fetch all device IDs associated with the user, if not already stored in Redis or another data source.
//            List<String> deviceIds = redisService.getDeviceIdsForUser(email); // Replace this with the actual method to retrieve all deviceIds
//            for (String deviceId : deviceIds) {
//                if (redisService.hasRefreshToken(email, deviceId)) {
//                    hasValidRefresh = true;
//                    break; // No need to check further if we find one valid refresh token
//                }
//            }
//
//            if (!hasValidRefresh) {
//                // No valid refresh token, deactivate the push tokens for this user
//                List<PushToken> tokens = pushTokenRepository.findByUserId(user.getId());
//
//                boolean modified = false;
//                for (PushToken token : tokens) {
//                    if (token.isActive()) {
//                        token.setActive(false);
//                        modified = true;
//                    }
//                }
//
//                if (modified) {
//                    pushTokenRepository.saveAll(tokens);
//                    System.out.println("🔒 Deactivated push tokens for user: " + email);
//                }
//            }
//        }
//    }
//
//}


//package com.fyp.backend.jobs;
//
//import com.fyp.backend.model.PushToken;
//import com.fyp.backend.model.User;
//import com.fyp.backend.repository.PushTokenRepository;
//import com.fyp.backend.repository.UserRepository;
//import com.fyp.backend.service.RedisService;
//import jakarta.transaction.Transactional;
//import org.springframework.beans.factory.annotation.Autowired;
//import org.springframework.scheduling.annotation.Scheduled;
//import org.springframework.stereotype.Component;
//
//import java.util.List;
//
//@Component
//public class PushTokenCleanupJob {
//
//    @Autowired
//    private RedisService redisService;
//
//    @Autowired
//    private UserRepository userRepository;
//
//    @Autowired
//    private PushTokenRepository pushTokenRepository;
//
//    /**
//     * Scheduled cleanup: runs daily at 2 AM
//     */
////    @Scheduled(cron = "0 0 2 * * *") // second, minute, hour, day, month, dayOfWeek
//    @Scheduled(cron = "0 * * * * *") // ✅ Runs every minute
//    @Transactional
//    public void cleanupInactivePushTokens() {
//        System.out.println("CLEANING UP PUSH TOKENS");
//        List<User> allUsers = userRepository.findAll();
//
//        for (User user : allUsers) {
//            String email = user.getEmail();
//
//            // Check if the user has any devices with expired refresh tokens
//            List<String> deviceIds = redisService.getDeviceIdsForUser(email);
//            boolean hasExpiredRefreshToken = false;
//
//            for (String deviceId : deviceIds) {
//                // Check if the refresh token for the device is expired
//                if (redisService.isRefreshTokenExpired(email, deviceId)) {
//                    hasExpiredRefreshToken = true;
//                    // Revoke expired refresh token
//                    redisService.revokeRefreshToken(email, deviceId);
//                }
//            }
//
//            if (hasExpiredRefreshToken) {
//                // If any refresh token is expired, deactivate the push tokens for this user
//                List<PushToken> tokens = pushTokenRepository.findByUserId(user.getId());
//
//                boolean modified = false;
//                for (PushToken token : tokens) {
//                    if (token.isActive()) {
//                        token.setActive(false);
//                        modified = true;
//                    }
//                }
//
//                if (modified) {
//                    pushTokenRepository.saveAll(tokens);
//                    System.out.println("🔒 Deactivated push tokens for user: " + email);
//                }
//            }
//        }
//    }
//}

package com.fyp.backend.jobs;

import com.fyp.backend.model.PushToken;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.PushTokenRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.service.RedisService;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class PushTokenCleanupJob {

    @Autowired
    private RedisService redisService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PushTokenRepository pushTokenRepository;

    /**
     * Scheduled cleanup: runs daily at 2 AM
     */
    @Scheduled(cron = "0 0 2 * * *") // Run daily at 2 AM
//    @Scheduled(cron = "0 * * * * *") // ✅ Runs every minute
    @Transactional
    public void cleanupInactivePushTokens() {
        System.out.println("CLEANING UP PUSH TOKENS");

        // Fetch all users from the database
        List<User> allUsers = userRepository.findAll();

        for (User user : allUsers) {
            String email = user.getEmail();

            // Fetch all devices for the user
            List<String> deviceIds = redisService.getDeviceIdsForUser(email);

            for (String deviceId : deviceIds) {
                // Check if the refresh token for the device is expired
                if (redisService.isRefreshTokenExpired(email, deviceId)) {
                    System.out.println("Expired refresh token found for user: " + email + " (Device: " + deviceId + ")");
                    // Revoke expired refresh token
//                    redisService.revokeRefreshToken(email, deviceId);

                    // Deactivate push tokens for this user and device
                    List<PushToken> tokens = pushTokenRepository.findByUserIdAndDeviceId(user.getId(), deviceId);

                    boolean modified = false;
                    for (PushToken token : tokens) {
                        if (token.isActive()) {
                            token.setActive(false);  // Deactivate the token
                            modified = true;
                        }
                    }

                    if (modified) {
                        pushTokenRepository.saveAll(tokens);  // Save the modified tokens
                        System.out.println("🔒 Deactivated push tokens for user: " + email + " (Device: " + deviceId + ")");
                    }
                }
            }
        }
    }
}

