package com.fyp.backend.config.websocket;

import com.fyp.backend.config.mvc.WebConfig;
import com.fyp.backend.service.RedisService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.context.annotation.Lazy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Configuration
@EnableWebSocketMessageBroker
@EnableScheduling // ✅ Enables scheduled tasks (for heartbeats)
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Autowired
    private WebSocketInterceptor webSocketInterceptor;

    @Autowired
    private RedisService redisService;

    private final TaskScheduler messageBrokerTaskScheduler;

    private static final Logger LOGGER = LoggerFactory.getLogger(WebSocketConfig.class);

    @Autowired
    public WebSocketConfig(@Lazy TaskScheduler taskScheduler) { // ✅ Use built-in TaskScheduler with @Lazy to prevent circular dependency
        this.messageBrokerTaskScheduler = taskScheduler;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Register WebSocket endpoint for client connections
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                .addInterceptors(webSocketInterceptor)
                .withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.setApplicationDestinationPrefixes("/app");

        registry.enableSimpleBroker("/topic", "/user")
                .setHeartbeatValue(new long[]{10000, 20000}) // ✅ 10s client -> server, 20s server -> client
                .setTaskScheduler(messageBrokerTaskScheduler); // ✅ Use built-in TaskScheduler

        registry.setUserDestinationPrefix("/user"); // For private messaging
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);

                // Handle heartbeat command, refresh TTL
                if (accessor.getCommand() == null) {
                    String userEmail = (String) accessor.getSessionAttributes().get("userEmail");
                    String deviceId = (String) accessor.getSessionAttributes().get("deviceId");  // Get deviceId from session

                    if (userEmail != null && deviceId != null) {
                        redisService.refreshUserOnlineStatus(userEmail, deviceId);
                        LOGGER.info("🔄 Refreshed TTL for user: {} on device: {}", userEmail, deviceId);
                    }
                }

                return message;
            }
        });
    }

}
