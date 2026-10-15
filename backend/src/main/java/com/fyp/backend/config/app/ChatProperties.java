package com.fyp.backend.config.app;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import lombok.Data;

/**
 * Chat behaviour that is policy rather than code: set in application.properties
 * (overridable from the environment), read where the rule is applied.
 */
@Configuration
@ConfigurationProperties(prefix = "chat")
@Data
public class ChatProperties {

    /**
     * How long after sending a message its sender may still take it back for
     * everyone (see ChatService.recallMessageAndBroadcast). Two minutes is what
     * WeChat allows, which is the rule most of the church already knows.
     */
    private Duration recallWindow = Duration.ofMinutes(2);
}
