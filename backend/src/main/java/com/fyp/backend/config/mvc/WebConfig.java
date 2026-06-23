package com.fyp.backend.config.mvc;

import org.springframework.core.env.Environment;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

@Configuration
public class WebConfig {

    private static final Logger LOGGER = LoggerFactory.getLogger(WebConfig.class);

    @Autowired
    private Environment environment;

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        String ipAddr = environment.getProperty("server.address", "localhost");
        String fullAddr = "http://" + ipAddr + ":8081";

        List<String> allowedOrigins = new ArrayList<>(List.of(
                fullAddr,
                "http://localhost:8081",
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
                "https://*.ngrok-free.dev"));

        // Extra production web origins via env (comma-separated), e.g. the deployed web
        // app domain. Keeps prod origins out of source and updatable without a rebuild.
        String extraOrigins = environment.getProperty("APP_CORS_ORIGINS", "");
        for (String origin : extraOrigins.split(",")) {
            String trimmed = origin.trim();
            if (!trimmed.isEmpty()) {
                allowedOrigins.add(trimmed);
            }
        }

        LOGGER.info("Configuring CORS for {} allowed origin pattern(s)", allowedOrigins.size());

        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/**")
                        .allowedOriginPatterns(allowedOrigins.toArray(new String[0]))
                        .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                        .allowedHeaders("*")
                        .allowCredentials(true);
            }
        };
    }
}
