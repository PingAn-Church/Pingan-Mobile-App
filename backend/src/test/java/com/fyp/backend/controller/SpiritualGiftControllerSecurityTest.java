package com.fyp.backend.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import com.fyp.backend.controller.learning.SpiritualGiftController;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.service.SpiritualGiftService;
import com.fyp.backend.service.UserService;
import com.fyp.backend.util.JwtUtil;

@WebMvcTest(controllers = SpiritualGiftController.class)
@Import({ SpringSecurityConfig.class, JwtAuthenticationFilter.class })
@TestPropertySource(properties = { "IP_ADDR=127.0.0.1" })
class SpiritualGiftControllerSecurityTest {

    @Autowired private MockMvc mockMvc;

    @MockBean private SpiritualGiftService spiritualGiftService;
    @MockBean private UserService userService;
    @MockBean private JwtUtil jwtUtil;
    @MockBean private UserRepository userRepository;

    @Test
    void guestCannotReadOrWriteServerSideResults() throws Exception {
        mockMvc.perform(get("/api/spiritual-gifts/me/result"))
                .andExpect(status().is4xxClientError());
        mockMvc.perform(put("/api/spiritual-gifts/me/result")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentVersion\":\"1\",\"answers\":[]}"))
                .andExpect(status().is4xxClientError());
    }
}
