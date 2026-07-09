package com.fyp.backend.controller;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
 * Production media URLs must not depend on the backend container's localhost/port.
 * MEDIA_PUBLIC_BASE_URL gives already-built clients a stable, externally reachable
 * /media origin even when Spring Boot is behind a reverse proxy.
 */
@WebMvcTest(controllers = OSSController.class)
@Import({ SpringSecurityConfig.class, JwtAuthenticationFilter.class, MediaTokenService.class })
@TestPropertySource(properties = {
        "IP_ADDR=127.0.0.1",
        "MEDIA_GATEWAY_ENABLED=true",
        "MEDIA_PUBLIC_BASE_URL=https://api.pingan.example/backend/"
})
class OSSControllerPublicBaseUrlTest {

    private static final Pattern PUBLIC_GATEWAY_URL =
            Pattern.compile("^https://api\\.pingan\\.example/backend/media/(.+)\\?e=(\\d+)&s=([A-Za-z0-9_-]+)$");

    @Autowired private MockMvc mockMvc;
    @Autowired private MediaTokenService mediaTokenService;

    @MockBean private OSSService ossService;
    @MockBean private JwtUtil jwtUtil;
    @MockBean private UserRepository userRepository;

    private void assertValidPublicGatewayUrl(String url, String expectedObjectKey) {
        Matcher matcher = PUBLIC_GATEWAY_URL.matcher(url);
        assertTrue(matcher.matches(), "not a configured public gateway URL: " + url);
        assertTrue(matcher.group(1).equals(expectedObjectKey),
                "unexpected object key in " + url);
        assertTrue(mediaTokenService.verify(matcher.group(1), matcher.group(2), matcher.group(3)),
                "gateway URL signature does not verify: " + url);
    }

    @Test
    @WithMockUser
    void downloadUrlUsesConfiguredPublicBaseUrl() throws Exception {
        when(ossService.getFolderPath("profile")).thenReturn("userProfilePictures/");

        String body = mockMvc.perform(get("/oss/presigned-download-url")
                        .param("fileName", "avatar.jpg")
                        .param("fileType", "profile"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertValidPublicGatewayUrl(body, "userProfilePictures/avatar.jpg");
    }

    @Test
    @WithMockUser
    void listPicturesUsesConfiguredPublicBaseUrl() throws Exception {
        Map<String, Object> page = new LinkedHashMap<>();
        page.put("success", true);
        page.put("data", List.of("eventPictures/a.jpg"));
        page.put("pagination", Map.of("nextMarker", "", "hasMore", false, "size", 20));
        when(ossService.listObjectsPage("event", 20, null)).thenReturn(page);

        String json = mockMvc.perform(get("/oss/list-pictures").param("fileType", "event"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.length()").value(1))
                .andReturn().getResponse().getContentAsString();

        String firstUrl = com.jayway.jsonpath.JsonPath.read(json, "$.data[0]");
        assertValidPublicGatewayUrl(firstUrl, "eventPictures/a.jpg");
    }
}
