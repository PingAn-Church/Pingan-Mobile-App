package com.fyp.backend.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URL;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.fyp.backend.config.security.JwtAuthenticationFilter;
import com.fyp.backend.config.security.SpringSecurityConfig;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.service.MediaTokenService;
import com.fyp.backend.service.OSSService;
import com.fyp.backend.util.JwtUtil;

/**
 * MEDIA_GATEWAY_ENABLED=false is the emergency rollback: download-URL endpoints must
 * fall straight back to OSS presigned URLs.
 */
@WebMvcTest(controllers = OSSController.class)
@Import({ SpringSecurityConfig.class, JwtAuthenticationFilter.class, MediaTokenService.class })
@TestPropertySource(properties = { "IP_ADDR=127.0.0.1", "MEDIA_GATEWAY_ENABLED=false" })
class OSSControllerLegacyPresignTest {

    @Autowired private MockMvc mockMvc;

    @MockBean private OSSService ossService;
    @MockBean private JwtUtil jwtUtil;
    @MockBean private UserRepository userRepository;

    @Test
    @WithMockUser
    void downloadUrlFallsBackToOssPresignedUrl() throws Exception {
        when(ossService.getFolderPath("event")).thenReturn("eventPictures/");
        when(ossService.generatePresignedDownloadUrl("eventPictures/pic.jpg", 60))
                .thenReturn(new URL("https://bucket.oss.example.com/eventPictures/pic.jpg?Signature=abc"));

        mockMvc.perform(get("/oss/presigned-download-url")
                        .param("fileName", "pic.jpg")
                        .param("fileType", "event"))
                .andExpect(status().isOk())
                .andExpect(content().string("https://bucket.oss.example.com/eventPictures/pic.jpg?Signature=abc"));
    }

    @Test
    @WithMockUser
    void conversationDownloadUrlFallsBackToOssPresignedUrl() throws Exception {
        when(ossService.generatePresignedDownloadUrl("conversations/42/voice_1.m4a", 60))
                .thenReturn(new URL("https://bucket.oss.example.com/conversations/42/voice_1.m4a?Signature=xyz"));

        mockMvc.perform(get("/oss/conversations/presigned-download-url")
                        .param("fileName", "voice_1.m4a")
                        .param("conversationId", "42"))
                .andExpect(status().isOk())
                .andExpect(content().string("https://bucket.oss.example.com/conversations/42/voice_1.m4a?Signature=xyz"));
    }
}
