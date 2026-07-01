package com.fyp.backend.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.fyp.backend.config.security.JwtAuthenticationFilter;
import com.fyp.backend.config.security.SpringSecurityConfig;
import com.fyp.backend.dto.AppReleaseDto;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.service.AppReleaseService;
import com.fyp.backend.service.OSSService;
import com.fyp.backend.service.RedisService;
import com.fyp.backend.service.UserAccountDeletionService;
import com.fyp.backend.service.UserService;
import com.fyp.backend.util.JwtUtil;

/**
 * Locks in the authorization rules and PII/response shapes that the hardening work
 * established. Pure web-layer slice: the real security config + JWT filter are
 * loaded, every collaborator is mocked, and no DB/Redis/OSS/SMTP is touched.
 */
@WebMvcTest(controllers = { UserController.class, OSSController.class, AppReleaseController.class })
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
    @MockBean private AppReleaseService appReleaseService;
    @MockBean private UserAccountDeletionService userAccountDeletionService;

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
        when(jwtUtil.extractEmail(anyString())).thenReturn("admin@example.com");
        when(userRepository.findByEmail("admin@example.com"))
                .thenReturn(java.util.Optional.of(userWithEmail(1, "admin@example.com")));
        when(userRepository.findAll()).thenReturn(List.of(userWithEmail(2, "other@example.com")));

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

    // ---- directory search: authenticated, no email, clamped ---------------

    @Test
    void userSearchIsBlockedForAnonymous() throws Exception {
        mockMvc.perform(get("/api/users/search")).andExpect(status().is4xxClientError());
    }

    @Test
    @WithMockUser
    void userSearchOmitsEmailAndClampsPageSize() throws Exception {
        when(userRepository.findByActiveTrue(any(Pageable.class)))
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
    @WithMockUser
    void ossDeleteIsAllowedForAuthenticated() throws Exception {
        when(ossService.getFolderPath("profile")).thenReturn("userProfilePictures/");
        mockMvc.perform(delete("/oss/delete").param("fileName", "x.jpg").param("fileType", "profile"))
                .andExpect(status().isOk());
    }

    @Test
    void ossListIsBlockedForAnonymous() throws Exception {
        mockMvc.perform(get("/oss/list-pictures").param("fileType", "event"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    void ossUploadPresignStaysOpenForRegistration() throws Exception {
        when(ossService.getFolderPath("profile")).thenReturn("userProfilePictures/");
        when(ossService.generatePresignedUploadUrl(anyString(), anyInt()))
                .thenReturn(new URL("https://oss.example.com/userProfilePictures/a.jpg"));

        mockMvc.perform(get("/oss/presigned-upload-url").param("fileName", "a.jpg").param("fileType", "profile"))
                .andExpect(status().isOk());
    }

    @Test
    void appReleaseLatestIsPublicBeforeLogin() throws Exception {
        when(appReleaseService.getLatest("android", "direct"))
                .thenReturn(new AppReleaseDto("android", "direct", "0.1.5", 105, 105,
                        false, "https://rn-app.pingan.org.sg/android", "https://rn-app.pingan.org.sg/android",
                        null, null, "", null, Map.of()));

        mockMvc.perform(get("/api/app-releases/latest")
                        .param("platform", "android")
                        .param("channel", "direct"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.latestVersionCode").value(105));
    }
}
