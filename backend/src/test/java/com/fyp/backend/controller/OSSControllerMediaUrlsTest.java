package com.fyp.backend.controller;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
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
import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.service.ConversationService;
import com.fyp.backend.service.MediaReferenceService;
import com.fyp.backend.service.MediaTokenService;
import com.fyp.backend.service.OSSService;
import com.fyp.backend.util.JwtUtil;

/**
 * With the media gateway enabled (the default), the download-URL endpoints must mint
 * request-host /media URLs whose signatures the real MediaTokenService accepts —
 * proving the frontend can consume them without any contract change.
 */
@WebMvcTest(controllers = OSSController.class)
@Import({ SpringSecurityConfig.class, JwtAuthenticationFilter.class, MediaTokenService.class })
// The flag is pinned (not just defaulted) so a MEDIA_GATEWAY_ENABLED entry in a
// developer's local .env can't flip this slice to legacy presigning.
@TestPropertySource(properties = { "IP_ADDR=127.0.0.1", "MEDIA_GATEWAY_ENABLED=true" })
class OSSControllerMediaUrlsTest {

    /** MockMvc requests carry no port, so gateway URLs are rooted at http://localhost. */
    private static final Pattern GATEWAY_URL =
            Pattern.compile("^http://localhost/media/(.+)\\?e=(\\d+)&s=([A-Za-z0-9_-]+)$");

    @Autowired private MockMvc mockMvc;
    @Autowired private MediaTokenService mediaTokenService;

    @MockBean private OSSService ossService;
    @MockBean private JwtUtil jwtUtil;
    @MockBean private UserRepository userRepository;
    @MockBean private ConversationService conversationService;
    @MockBean private MediaReferenceService mediaReferenceService;

    @BeforeEach
    void authenticatedUser() {
        User user = new User();
        user.setId(7L);
        user.setEmail("user");
        user.setActive(true);
        when(userRepository.findByEmail("user")).thenReturn(Optional.of(user));
        when(conversationService.isUserPartOfConversation(42L, 7L)).thenReturn(true);
    }

    private void assertValidGatewayUrl(String url, String expectedObjectKey) {
        Matcher matcher = GATEWAY_URL.matcher(url);
        assertTrue(matcher.matches(), "not a gateway URL: " + url);
        assertTrue(matcher.group(1).equals(expectedObjectKey),
                "unexpected object key in " + url);
        assertTrue(mediaTokenService.verify(matcher.group(1), matcher.group(2), matcher.group(3)),
                "gateway URL signature does not verify: " + url);
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void downloadUrlPointsAtMediaGateway() throws Exception {
        when(ossService.getFolderPath("event")).thenReturn("eventPictures/");

        String body = mockMvc.perform(get("/oss/presigned-download-url")
                        .param("fileName", "pic.jpg")
                        .param("fileType", "event"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertValidGatewayUrl(body, "eventPictures/pic.jpg");
    }

    @Test
    @WithMockUser
    void conversationDownloadUrlPointsAtMediaGateway() throws Exception {
        String body = mockMvc.perform(get("/oss/conversations/presigned-download-url")
                        .param("fileName", "voice_1.m4a")
                        .param("conversationId", "42"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertValidGatewayUrl(body, "conversations/42/voice_1.m4a");
    }

    @Test
    @WithMockUser
    void groupIconDownloadRequiresConversationMembership() throws Exception {
        when(conversationService.isUserPartOfConversation(99L, 7L)).thenReturn(false);

        mockMvc.perform(get("/oss/presigned-download-url")
                        .param("fileName", "group.jpg")
                        .param("fileType", "group")
                        .param("conversationId", "99"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void listPicturesReturnsGatewayUrls() throws Exception {
        Map<String, Object> page = new LinkedHashMap<>();
        page.put("success", true);
        page.put("data", List.of("eventPictures/a.jpg", "eventPictures/b.jpg"));
        page.put("pagination", Map.of("nextMarker", "m", "hasMore", true, "size", 20));
        when(ossService.listObjectsPage("event", 20, null)).thenReturn(page);

        String json = mockMvc.perform(get("/oss/list-pictures").param("fileType", "event"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.pagination.hasMore").value(true))
                .andReturn().getResponse().getContentAsString();

        String firstUrl = com.jayway.jsonpath.JsonPath.read(json, "$.data[0]");
        assertValidGatewayUrl(firstUrl, "eventPictures/a.jpg");
    }

    @Test
    void publicCourseDownloadUrlDoesNotRequireLogin() throws Exception {
        when(ossService.getFolderPath("course")).thenReturn("coursePictures/");

        String body = mockMvc.perform(get("/oss/public-download-url")
                        .param("fileName", "cover.jpg")
                        .param("fileType", "course"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertValidGatewayUrl(body, "coursePictures/cover.jpg");
    }

    @Test
    void publicDownloadUrlRejectsPrivateMediaTypes() throws Exception {
        mockMvc.perform(get("/oss/public-download-url")
                        .param("fileName", "avatar.jpg")
                        .param("fileType", "profile"))
                .andExpect(status().isForbidden());
    }

    @Test
    void anonymousUploadOnlyAllowsRegistrationProfilePictures() throws Exception {
        mockMvc.perform(get("/oss/presigned-upload-url")
                        .param("fileName", "event.jpg")
                        .param("fileType", "event"))
                .andExpect(status().isForbidden());
    }
}
