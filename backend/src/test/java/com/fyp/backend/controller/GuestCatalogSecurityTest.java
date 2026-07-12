package com.fyp.backend.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.fyp.backend.config.security.JwtAuthenticationFilter;
import com.fyp.backend.config.security.SpringSecurityConfig;
import com.fyp.backend.controller.learning.CourseController;
import com.fyp.backend.controller.learning.EnrollmentController;
import com.fyp.backend.controller.learning.ReviewController;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.model.Course;
import com.fyp.backend.service.CourseService;
import com.fyp.backend.service.EnrollmentService;
import com.fyp.backend.service.EventService;
import com.fyp.backend.service.ReviewService;
import com.fyp.backend.service.UserService;
import com.fyp.backend.util.JwtUtil;

@WebMvcTest(controllers = {
        CourseController.class,
        ReviewController.class,
        EnrollmentController.class,
        EventController.class
})
@Import({ SpringSecurityConfig.class, JwtAuthenticationFilter.class })
@TestPropertySource(properties = { "IP_ADDR=127.0.0.1" })
class GuestCatalogSecurityTest {

    @Autowired private MockMvc mockMvc;

    @MockBean private CourseService courseService;
    @MockBean private ReviewService reviewService;
    @MockBean private EnrollmentService enrollmentService;
    @MockBean private EventService eventService;
    @MockBean private UserService userService;
    @MockBean private JwtUtil jwtUtil;
    @MockBean private UserRepository userRepository;
    @MockBean private CourseRepository courseRepository;

    @BeforeEach
    void setUpPublicResponses() {
        when(courseService.listPublishedCourses(isNull(), anyInt(), anyInt(), anyString(), anyString()))
                .thenReturn(Map.of("success", true, "data", List.of(), "pagination", Map.of()));
        when(courseService.listCategories(true)).thenReturn(List.of());
        when(courseService.getModuleDetail(anyLong(), isNull(), org.mockito.ArgumentMatchers.eq(true)))
                .thenReturn(Map.of("success", true, "data", Map.of("id", "1")));
        when(reviewService.listReviews(anyLong(), any(Pageable.class)))
                .thenReturn(Map.of("data", List.of(), "pagination", Map.of()));
        when(courseRepository.findByIdAndIsPublishedTrue(1L))
                .thenReturn(Optional.of(new Course()));
    }

    @Test
    void anonymousUserCanReadOnlyPublicCatalogEndpoints() throws Exception {
        mockMvc.perform(get("/api/fn/getAllPublishedCourse"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/fn/categoryHandler"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/fn/getModuleDetail/1"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/fn/getCourseReviews/1"))
                .andExpect(status().isOk());
    }

    @Test
    void anonymousUserCannotReadPersonalLearningOrEvents() throws Exception {
        mockMvc.perform(get("/api/fn/isEnrolled/1"))
                .andExpect(status().is4xxClientError());
        mockMvc.perform(get("/api/fn/getCertificates"))
                .andExpect(status().is4xxClientError());
        mockMvc.perform(get("/api/events"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    void anonymousUserCannotWriteLearningData() throws Exception {
        mockMvc.perform(post("/api/fn/postUserEnrollment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"courseId\":1}"))
                .andExpect(status().is4xxClientError());
        mockMvc.perform(post("/api/fn/courseReviewHandler/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":5,\"review\":\"Great\"}"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    void anonymousUserCannotReadReviewsForDraftCourse() throws Exception {
        mockMvc.perform(get("/api/fn/getCourseReviews/99"))
                .andExpect(status().isNotFound());
    }
}
