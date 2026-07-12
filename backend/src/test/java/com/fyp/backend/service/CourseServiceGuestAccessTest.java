package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;

import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.Course;
import com.fyp.backend.model.CourseResource;
import com.fyp.backend.model.CourseSection;
import com.fyp.backend.model.CourseVideo;
import com.fyp.backend.repository.CategoryRepository;
import com.fyp.backend.repository.CourseOutcomeRepository;
import com.fyp.backend.repository.CourseQuizRepository;
import com.fyp.backend.repository.CourseRatingRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.CourseResourceRepository;
import com.fyp.backend.repository.CourseSectionRepository;
import com.fyp.backend.repository.CourseVideoRepository;
import com.fyp.backend.repository.CourseWishlistRepository;
import com.fyp.backend.repository.QuizAttemptRepository;
import com.fyp.backend.repository.ResourceProgressRepository;
import com.fyp.backend.repository.UserVideoProgressRepository;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CourseServiceGuestAccessTest {

    @Mock private CourseRepository courseRepository;
    @Mock private CategoryRepository categoryRepository;
    @Mock private CourseSectionRepository sectionRepository;
    @Mock private CourseVideoRepository videoRepository;
    @Mock private CourseResourceRepository resourceRepository;
    @Mock private CourseOutcomeRepository outcomeRepository;
    @Mock private CourseQuizRepository quizRepository;
    @Mock private CourseRatingRepository ratingRepository;
    @Mock private CourseWishlistRepository wishlistRepository;
    @Mock private UserVideoProgressRepository videoProgressRepository;
    @Mock private ResourceProgressRepository resourceProgressRepository;
    @Mock private QuizAttemptRepository quizAttemptRepository;

    @InjectMocks private CourseService courseService;

    private Course course() {
        Course course = new Course();
        course.setId(10L);
        course.setTitle("Published course");
        course.setPublished(true);
        return course;
    }

    private CourseVideo video(long id, boolean preview, String url) {
        CourseVideo video = new CourseVideo();
        video.setId(id);
        video.setCourseId(10L);
        video.setSectionId(20L);
        video.setTitle("Video " + id);
        video.setPreview(preview);
        video.setVideoUrl(url);
        return video;
    }

    private CourseResource resource(long id, boolean preview, String url) {
        CourseResource resource = new CourseResource();
        resource.setId(id);
        resource.setCourseId(10L);
        resource.setSectionId(20L);
        resource.setTitle("Resource " + id);
        resource.setPreview(preview);
        resource.setResourceUrl(url);
        return resource;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> lessons(Map<String, Object> response) {
        Map<String, Object> data = (Map<String, Object>) response.get("data");
        List<Map<String, Object>> modules = (List<Map<String, Object>>) data.get("modules");
        return (List<Map<String, Object>>) modules.get(0).get("lessons");
    }

    private void stubCourseContent() {
        CourseSection section = new CourseSection();
        section.setId(20L);
        section.setCourseId(10L);
        section.setTitle("Section");
        when(sectionRepository.findByCourseIdOrderByOrderIndexAsc(10L)).thenReturn(List.of(section));
        when(outcomeRepository.findByCourseIdOrderByOrderIndexAsc(10L)).thenReturn(List.of());
        when(videoRepository.findBySectionIdOrderByOrderIndexAsc(20L)).thenReturn(List.of(
                video(1L, true, "https://example.test/preview-video"),
                video(2L, false, "https://example.test/private-video")));
        when(resourceRepository.findBySectionIdOrderByOrderIndexAsc(20L)).thenReturn(List.of(
                resource(3L, true, "https://example.test/preview-document"),
                resource(4L, false, "https://example.test/private-document")));
        when(quizRepository.findBySectionIdOrderByOrderIndexAsc(20L)).thenReturn(List.of());
    }

    @Test
    void anonymousDetailKeepsPreviewUrlsAndStripsPrivateUrls() {
        when(courseRepository.findByIdAndIsPublishedTrue(10L)).thenReturn(Optional.of(course()));
        stubCourseContent();

        List<Map<String, Object>> lessons = lessons(courseService.getModuleDetail(10L, null, true));

        assertEquals("https://example.test/preview-video", lessons.get(0).get("video_url"));
        assertNull(lessons.get(1).get("video_url"));
        assertEquals("https://example.test/preview-document", lessons.get(2).get("resource_url"));
        assertNull(lessons.get(3).get("resource_url"));
        verifyNoInteractions(wishlistRepository, videoProgressRepository, resourceProgressRepository,
                quizAttemptRepository);
    }

    @Test
    void anonymousDetailDoesNotExposeDraftCourse() {
        when(courseRepository.findByIdAndIsPublishedTrue(10L)).thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class,
                () -> courseService.getModuleDetail(10L, null, true));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
    }

    @Test
    void authenticatedDetailKeepsAllUrls() {
        when(courseRepository.findById(10L)).thenReturn(Optional.of(course()));
        stubCourseContent();

        List<Map<String, Object>> lessons = lessons(courseService.getModuleDetail(10L, 7L, false));

        assertEquals("https://example.test/private-video", lessons.get(1).get("video_url"));
        assertEquals("https://example.test/private-document", lessons.get(3).get("resource_url"));
    }
}
