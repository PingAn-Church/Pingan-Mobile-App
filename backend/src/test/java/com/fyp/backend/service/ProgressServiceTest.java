package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fyp.backend.model.CourseEnrollment;
import com.fyp.backend.model.CourseVideo;
import com.fyp.backend.repository.CourseEnrollmentRepository;
import com.fyp.backend.repository.CourseQuizRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.CourseResourceRepository;
import com.fyp.backend.repository.CourseSectionRepository;
import com.fyp.backend.repository.CourseVideoRepository;
import com.fyp.backend.repository.QuizAttemptRepository;
import com.fyp.backend.repository.ResourceProgressRepository;
import com.fyp.backend.repository.UserModuleProgressRepository;
import com.fyp.backend.repository.UserVideoProgressRepository;

/**
 * Verifies the single source of truth for course progress: percentage math and
 * completion flagging. Keeping this correct prevents the section-vs-item drift
 * called out as a migration risk.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ProgressServiceTest {

    @Mock private CourseVideoRepository videoRepository;
    @Mock private CourseResourceRepository resourceRepository;
    @Mock private CourseSectionRepository sectionRepository;
    @Mock private UserVideoProgressRepository videoProgressRepository;
    @Mock private ResourceProgressRepository resourceProgressRepository;
    @Mock private UserModuleProgressRepository moduleProgressRepository;
    @Mock private CourseEnrollmentRepository enrollmentRepository;
    @Mock private CourseQuizRepository quizRepository;
    @Mock private QuizAttemptRepository attemptRepository;
    @Mock private CourseRepository courseRepository;
    @Mock private CertificateService certificateService;
    @Mock private AchievementService achievementService;
    @Mock private PushNotificationService pushNotificationService;

    @InjectMocks private ProgressService progressService;

    private static final long USER = 5L;
    private static final long COURSE = 10L;

    private CourseVideo video(long id) {
        CourseVideo v = new CourseVideo();
        v.setId(id);
        return v;
    }

    private CourseEnrollment stubCourse(int videoCount, long completedVideos) {
        when(videoRepository.findByCourseIdOrderByOrderIndexAsc(COURSE))
                .thenReturn(java.util.stream.LongStream.rangeClosed(1, videoCount).mapToObj(this::video).toList());
        when(resourceRepository.findByCourseIdOrderByOrderIndexAsc(COURSE)).thenReturn(List.of());
        when(quizRepository.findByCourseIdOrderByOrderIndexAsc(COURSE)).thenReturn(List.of());
        when(videoProgressRepository.countByUserIdAndVideoIdInAndIsCompletedTrue(eq(USER), anyList()))
                .thenReturn(completedVideos);
        CourseEnrollment e = new CourseEnrollment();
        when(enrollmentRepository.findByUserIdAndCourseId(USER, COURSE)).thenReturn(Optional.of(e));
        when(enrollmentRepository.save(any(CourseEnrollment.class))).thenAnswer(i -> i.getArgument(0));
        return e;
    }

    @Test
    void halfOfVideosWatchedIsFiftyPercentAndNotComplete() {
        CourseEnrollment e = stubCourse(2, 1);
        double pct = progressService.recomputeCourseProgress(USER, COURSE);
        assertEquals(50.0, pct, 0.001);
        assertNull(e.getCompletionDate());
    }

    @Test
    void allItemsDoneIsHundredPercentAndComplete() {
        CourseEnrollment e = stubCourse(2, 2);
        double pct = progressService.recomputeCourseProgress(USER, COURSE);
        assertEquals(100.0, pct, 0.001);
        assertNotNull(e.getCompletionDate());
    }
}
