package com.fyp.backend.controller;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.fyp.backend.config.security.JwtAuthenticationFilter;
import com.fyp.backend.config.security.SpringSecurityConfig;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.service.AuthService;
import com.fyp.backend.service.PushNotificationService;
import com.fyp.backend.service.RedisService;
import com.fyp.backend.service.RefreshTokenService;
import com.fyp.backend.util.JwtUtil;

@WebMvcTest(controllers = AuthController.class)
@Import({ SpringSecurityConfig.class, JwtAuthenticationFilter.class })
@TestPropertySource(properties = "IP_ADDR=127.0.0.1")
class AuthControllerLogoutTest {

    private static final String EMAIL = "user@example.com";
    private static final String DEVICE_ID = "device-1";
    private static final String REFRESH_TOKEN = "refresh-token";

    @Autowired private MockMvc mockMvc;
    @MockBean private AuthService authService;
    @MockBean private RedisService redisService;
    @MockBean private JwtUtil jwtUtil;
    @MockBean private RefreshTokenService refreshTokenService;
    @MockBean private PushNotificationService pushNotificationService;
    @MockBean private UserRepository userRepository;

    @BeforeEach
    void validRefreshToken() {
        when(jwtUtil.extractEmail(REFRESH_TOKEN)).thenReturn(EMAIL);
        when(refreshTokenService.validateRefreshToken(EMAIL, DEVICE_ID, REFRESH_TOKEN)).thenReturn(true);
    }

    @Test
    void logoutWithoutAuthorizationRevokesDeviceSessionAndPush() throws Exception {
        performLogout(null).andExpect(status().isOk());

        verifyRevoked();
    }

    @Test
    void expiredAuthorizationDoesNotBlockLogout() throws Exception {
        performLogout("Bearer expired-access-token").andExpect(status().isOk());

        verifyRevoked();
        verify(jwtUtil, never()).extractEmail("expired-access-token");
    }

    @Test
    void mismatchedRefreshTokenDoesNotRevokeDevice() throws Exception {
        when(refreshTokenService.validateRefreshToken(EMAIL, DEVICE_ID, REFRESH_TOKEN)).thenReturn(false);

        performLogout(null).andExpect(status().isUnauthorized());

        verify(refreshTokenService, never()).deleteRefreshToken(EMAIL, DEVICE_ID);
        verify(pushNotificationService, never()).deactivatePushTokensForDevice(EMAIL, DEVICE_ID);
        verify(redisService, never()).setDeviceOffline(EMAIL, DEVICE_ID);
    }

    private org.springframework.test.web.servlet.ResultActions performLogout(String authorization)
            throws Exception {
        var request = post("/auth/logout")
                .param("deviceId", DEVICE_ID)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"" + REFRESH_TOKEN + "\"}");
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        return mockMvc.perform(request);
    }

    private void verifyRevoked() {
        verify(refreshTokenService).deleteRefreshToken(EMAIL, DEVICE_ID);
        verify(pushNotificationService).deactivatePushTokensForDevice(EMAIL, DEVICE_ID);
        verify(redisService).setDeviceOffline(EMAIL, DEVICE_ID);
    }
}
