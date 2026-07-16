package com.fyp.backend.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URL;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.fyp.backend.config.security.JwtAuthenticationFilter;
import com.fyp.backend.config.security.SpringSecurityConfig;
import com.fyp.backend.dto.AppReleaseDto;
import com.fyp.backend.model.MessageReport;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.service.AppReleaseService;
import com.fyp.backend.service.MediaTokenService;
import com.fyp.backend.service.MessageReportService;
import com.fyp.backend.service.OSSService;
import com.fyp.backend.service.RedisService;
import com.fyp.backend.service.UserAccountDeletionService;
import com.fyp.backend.service.UserBlockService;
import com.fyp.backend.service.UserService;
import com.fyp.backend.util.JwtUtil;

/**
 * Locks in the authorization rules and PII/response shapes that the hardening work
 * established. Pure web-layer slice: the real security config + JWT filter are
 * loaded, every collaborator is mocked, and no DB/Redis/OSS/SMTP is touched.
 */
@WebMvcTest(controllers = { UserController.class, OSSController.class, AppReleaseController.class,
        ReportController.class, BlockController.class })
@Import({ SpringSecurityConfig.class, JwtAuthenticationFilter.class })
// Satisfy placeholders read while building the slice (e.g. server.address=${IP_ADDR}).
@TestPropertySource(properties = { "IP_ADDR=127.0.0.1" })
class WebSecurityRulesTest {

    @Autowired private MockMvc mockMvc;

    @MockBean private UserRepository userRepository;
    @MockBean private JwtUtil jwtUtil;
    @MockBean private RedisService redisService;
    @MockBean private UserService userService;
    @MockBean private OSSService ossService;
    @MockBean private MediaTokenService mediaTokenService;
    @MockBean private AppReleaseService appReleaseService;
    @MockBean private UserAccountDeletionService userAccountDeletionService;
    @MockBean private MessageReportService messageReportService;
    @MockBean private UserBlockService userBlockService;

    private User userWithEmail(long id, String email) {
        User u = new User();
        u.setId(id);
        u.setFirstName("First" + id);
        u.setLastName("Last" + id);
        u.setEmail(email);
        u.setActive(true);
        return u;
    }

    // ---- full user directory is ADMIN-only --------------------------------

    @Test
    void fullUserListIsBlockedForAnonymous() throws Exception {
        mockMvc.perform(get("/api/users").header("Authorization", "Bearer t"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    @WithMockUser(roles = "USER")
    void fullUserListIsForbiddenForNonAdmin() throws Exception {
        mockMvc.perform(get("/api/users").header("Authorization", "Bearer t"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void fullUserListIsAllowedForAdmin() throws Exception {
        when(userService.searchUsers(anyString(), any(), any(), any(), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(userWithEmail(2, "other@example.com")),
                        PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/users").header("Authorization", "Bearer t"))
                .andExpect(status().isOk());
    }

    // ---- hard-delete of a user is ADMIN-only ------------------------------

    @Test
    void deleteUserIsBlockedForAnonymous() throws Exception {
        mockMvc.perform(delete("/api/users/5").header("Authorization", "Bearer t"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    @WithMockUser(roles = "USER")
    void deleteUserIsForbiddenForNonAdmin() throws Exception {
        mockMvc.perform(delete("/api/users/5").header("Authorization", "Bearer t"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void deleteUserIsAllowedForAdmin() throws Exception {
        mockMvc.perform(delete("/api/users/5").header("Authorization", "Bearer t"))
                .andExpect(status().isOk());
    }

    @Test
    void deleteOwnAccountIsBlockedForAnonymous() throws Exception {
        mockMvc.perform(delete("/api/users/me").header("Authorization", "Bearer t"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    @WithMockUser(roles = "USER")
    void deleteOwnAccountIsAllowedForAuthenticated() throws Exception {
        when(userService.getUserIdFromToken(anyString())).thenReturn(7L);

        mockMvc.perform(delete("/api/users/me").header("Authorization", "Bearer t"))
                .andExpect(status().isOk());
    }

    // ---- directory search: authenticated, no email, clamped ---------------

    @Test
    void userSearchIsBlockedForAnonymous() throws Exception {
        mockMvc.perform(get("/api/users/search")).andExpect(status().is4xxClientError());
    }

    @Test
    @WithMockUser
    void userSearchOmitsEmailAndClampsPageSize() throws Exception {
        when(userRepository.findByActiveTrueAndDeletedAccountFalse(any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(userWithEmail(2, "secret@example.com")),
                        PageRequest.of(0, 50), 1));

        mockMvc.perform(get("/api/users/search").param("size", "9999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].firstName").value("First2"))
                .andExpect(jsonPath("$.data[0].email").doesNotExist())
                .andExpect(jsonPath("$.pagination.size").value(50));
    }

    // ---- OSS management endpoints require auth; upload-presign stays open ---

    @Test
    void ossDeleteIsBlockedForAnonymous() throws Exception {
        mockMvc.perform(delete("/oss/delete").param("fileName", "x.jpg").param("fileType", "profile"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    @WithMockUser(roles = "USER")
    void ossDeleteIsForbiddenForNonAdmin() throws Exception {
        mockMvc.perform(delete("/oss/delete").param("fileName", "x.jpg").param("fileType", "profile"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void ossDeleteIsAllowedForAdmin() throws Exception {
        when(ossService.getFolderPath("profile")).thenReturn("userProfilePictures/");
        mockMvc.perform(delete("/oss/delete").param("fileName", "x.jpg").param("fileType", "profile"))
                .andExpect(status().isOk());
    }

    @Test
    void ossListIsBlockedForAnonymous() throws Exception {
        mockMvc.perform(get("/oss/list-pictures").param("fileType", "event"))
                .andExpect(status().is4xxClientError());
    }

    // ---- minting temporary download URLs requires a login -------------------

    @Test
    void downloadUrlMintIsBlockedForAnonymous() throws Exception {
        mockMvc.perform(get("/oss/presigned-download-url")
                        .param("fileName", "x.jpg").param("fileType", "profile"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    @WithMockUser
    void downloadUrlMintIsAllowedForAuthenticated() throws Exception {
        when(ossService.getFolderPath("profile")).thenReturn("userProfilePictures/");
        when(mediaTokenService.mintQuery(anyString())).thenReturn("e=1&s=sig");

        mockMvc.perform(get("/oss/presigned-download-url")
                        .param("fileName", "x.jpg").param("fileType", "profile"))
                .andExpect(status().isOk());
    }

    @Test
    void conversationDownloadUrlMintIsBlockedForAnonymous() throws Exception {
        mockMvc.perform(get("/oss/conversations/presigned-download-url")
                        .param("fileName", "voice_1.m4a").param("conversationId", "42"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    @WithMockUser
    void conversationDownloadUrlMintIsAllowedForAuthenticated() throws Exception {
        when(mediaTokenService.mintQuery(anyString())).thenReturn("e=1&s=sig");

        mockMvc.perform(get("/oss/conversations/presigned-download-url")
                        .param("fileName", "voice_1.m4a").param("conversationId", "42"))
                .andExpect(status().isOk());
    }

    @Test
    void ossUploadPresignStaysOpenForRegistration() throws Exception {
        when(ossService.getFolderPath("profile")).thenReturn("userProfilePictures/");
        when(ossService.generatePresignedUploadUrl(anyString(), anyInt()))
                .thenReturn(new URL("https://oss.example.com/userProfilePictures/a.jpg"));

        mockMvc.perform(get("/oss/presigned-upload-url").param("fileName", "a.jpg").param("fileType", "profile"))
                .andExpect(status().isOk());
    }

    // ---- message reporting: create is authenticated, review is ADMIN-only --

    @Test
    void reportCreateIsBlockedForAnonymous() throws Exception {
        mockMvc.perform(post("/api/reports")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"messageId\": 5}"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    @WithMockUser(roles = "USER")
    void reportCreateIsAllowedForAuthenticated() throws Exception {
        when(userService.getUserIdFromToken(anyString())).thenReturn(7L);
        when(messageReportService.createReport(MessageReport.TYPE_MESSAGE, 5L, 7L))
                .thenReturn(new MessageReport());

        mockMvc.perform(post("/api/reports")
                        .header("Authorization", "Bearer t")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"messageId\": 5}"))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "USER")
    void reportCreateAcceptsContentTypeBody() throws Exception {
        when(userService.getUserIdFromToken(anyString())).thenReturn(7L);
        when(messageReportService.createReport("THREAD", 9L, 7L)).thenReturn(new MessageReport());

        mockMvc.perform(post("/api/reports")
                        .header("Authorization", "Bearer t")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\": \"THREAD\", \"contentId\": 9}"))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "USER")
    void duplicateReportReturnsConflict() throws Exception {
        when(userService.getUserIdFromToken(anyString())).thenReturn(7L);
        when(messageReportService.createReport(MessageReport.TYPE_MESSAGE, 5L, 7L))
                .thenThrow(new IllegalStateException("This content has already been reported."));

        mockMvc.perform(post("/api/reports")
                        .header("Authorization", "Bearer t")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"messageId\": 5}"))
                .andExpect(status().isConflict());
    }

    @Test
    void reportQueueIsBlockedForAnonymous() throws Exception {
        mockMvc.perform(get("/api/reports")).andExpect(status().is4xxClientError());
    }

    @Test
    @WithMockUser(roles = "USER")
    void reportQueueIsForbiddenForNonAdmin() throws Exception {
        mockMvc.perform(get("/api/reports")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void reportQueueIsAllowedForAdmin() throws Exception {
        when(messageReportService.getReports(any(), any(), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(new MessageReport()), PageRequest.of(0, 50), 1));

        mockMvc.perform(get("/api/reports")
                        .param("status", "PENDING")
                        .param("from", "2026-07-01")
                        .param("to", "2026-07-31")
                        .param("size", "9999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.pagination.size").value(50))
                .andExpect(jsonPath("$.pagination.hasMore").value(false));
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void reportQueueRejectsInvalidDate() throws Exception {
        mockMvc.perform(get("/api/reports")
                        .param("from", "not-a-date"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser(roles = "USER")
    void reportResolveIsForbiddenForNonAdmin() throws Exception {
        mockMvc.perform(post("/api/reports/1/resolve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\": \"NO_PROBLEM\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void reportResolveIsAllowedForAdmin() throws Exception {
        when(userService.getUserIdFromToken(anyString())).thenReturn(1L);
        when(messageReportService.resolveReport(1L, "NO_PROBLEM", 1L)).thenReturn(new MessageReport());

        mockMvc.perform(post("/api/reports/1/resolve")
                        .header("Authorization", "Bearer t")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\": \"NO_PROBLEM\"}"))
                .andExpect(status().isOk());
    }

    // ---- user blocking: everything requires authentication -----------------

    @Test
    void blockListIsBlockedForAnonymous() throws Exception {
        mockMvc.perform(get("/api/blocks")).andExpect(status().is4xxClientError());
    }

    @Test
    @WithMockUser(roles = "USER")
    void blockListIsAllowedForAuthenticated() throws Exception {
        when(userService.getUserIdFromToken(anyString())).thenReturn(7L);
        when(userBlockService.getBlockedIds(7L)).thenReturn(List.of(3L));

        mockMvc.perform(get("/api/blocks").header("Authorization", "Bearer t"))
                .andExpect(status().isOk());
    }

    @Test
    void blockCreateIsBlockedForAnonymous() throws Exception {
        mockMvc.perform(post("/api/blocks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\": 3}"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    @WithMockUser(roles = "USER")
    void blockCreateIsAllowedForAuthenticated() throws Exception {
        when(userService.getUserIdFromToken(anyString())).thenReturn(7L);
        when(userBlockService.getStatus(7L, 3L))
                .thenReturn(Map.of("blockedByMe", true, "blockedMe", false, "canMessage", false));

        mockMvc.perform(post("/api/blocks")
                        .header("Authorization", "Bearer t")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\": 3}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blockedByMe").value(true));
    }

    @Test
    void appReleaseLatestIsPublicBeforeLogin() throws Exception {
        when(appReleaseService.getLatest("android", "direct"))
                .thenReturn(new AppReleaseDto("android", "direct", "0.1.5", 105, 105,
                        false, "https://rn-app.pingan.org.sg/android", "https://rn-app.pingan.org.sg/android",
                        "", null, null, "", null, Map.of()));

        mockMvc.perform(get("/api/app-releases/latest")
                        .param("platform", "android")
                        .param("channel", "direct"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.latestVersionCode").value(105));
    }
}
