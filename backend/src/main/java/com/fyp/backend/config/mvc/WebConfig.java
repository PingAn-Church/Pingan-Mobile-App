package com.fyp.backend.config.mvc;

import org.springframework.core.env.Environment;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Configuration
public class WebConfig {

    private static final Logger LOGGER = LoggerFactory.getLogger(WebConfig.class);

    @Autowired
    private Environment environment;

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        String ipAddr = environment.getProperty("server.address", "localhost");
        String fullAddr = "http://" + ipAddr + ":8081";
        LOGGER.info("Configuring CORS for address: {}", fullAddr);

        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/**")
                        .allowedOriginPatterns(fullAddr, "http://localhost:8081",
                                "http://localhost:19006",
                                "http://10.0.2.2:8081", // Emulator Backend Access
                                "http://10.0.2.2:8082",
                                "http://192.168.10.24:8081",
                                "http://192.168.50.15:8081",
                                "http://192.168.1.82:8081",
                                "https://hlryukc-pinganservice572-8081.exp.direct",
                                "https://fyp-pinganv-2-hc4mpb3lu-cheechengms-projects.vercel.app",
                                "https://*.vercel.app", // whitelist all vercel
                                "https://*.onrender.com",
                                "https://*.ngrok-free.dev")
                        .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                        .allowedHeaders("*")
                        .allowCredentials(true);
            }
        };
    }
}
