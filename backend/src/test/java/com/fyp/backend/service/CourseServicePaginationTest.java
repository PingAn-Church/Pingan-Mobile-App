package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import com.fyp.backend.model.Course;
import com.fyp.backend.repository.CategoryRepository;
import com.fyp.backend.repository.CourseQuizRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.CourseSectionRepository;
import com.fyp.backend.repository.CourseVideoRepository;
import com.fyp.backend.util.Pagination;

/**
 * Verifies the published-course listing pushes paging + ordering into the query
 * (no in-memory slicing), clamps the page size, whitelists the sort column, and
 * trims the heavy description from list items. Repositories are mocked.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CourseServicePaginationTest {

    @Mock private CourseRepository courseRepository;
    @Mock private CategoryRepository categoryRepository;
    @Mock private CourseSectionRepository sectionRepository;
    @Mock private CourseVideoRepository videoRepository;
    @Mock private CourseQuizRepository quizRepository;

    @InjectMocks private CourseService courseService;

    private Course publishedCourse(long id) {
        Course c = new Course();
        c.setId(id);
        c.setTitle("Course " + id);
        c.setDescription("a long description that should not ship in list payloads");
        c.setTags("");
        c.setPublished(true);
        c.setUpdatedAt(Instant.now());
        return c;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> dataOf(Map<String, Object> res) {
        return (List<Map<String, Object>>) res.get("data");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> paginationOf(Map<String, Object> res) {
        return (Map<String, Object>) res.get("pagination");
    }

    private Pageable capturePageable() {
        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(courseRepository).findByIsPublishedTrue(captor.capture());
        return captor.getValue();
    }

    @Test
    void pushesPagingAndSortIntoTheQueryAndTrimsDescription() {
        when(courseRepository.findByIsPublishedTrue(any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(publishedCourse(1)), PageRequest.of(0, 10), 25));

        Map<String, Object> res = courseService.listPublishedCourses(null, 10, 20, "updated_at", "desc");

        assertEquals(true, res.get("success"));
        assertEquals(1, dataOf(res).size());
        assertFalse(dataOf(res).get(0).containsKey("description"), "list payload must omit description");
        assertEquals(25L, paginationOf(res).get("totalCount"));
        assertEquals(true, paginationOf(res).get("hasMore"));

        Pageable p = capturePageable();
        assertEquals(2, p.getPageNumber()); // offset 20 / limit 10
        assertEquals(10, p.getPageSize());
        assertEquals("updatedAt", p.getSort().toList().get(0).getProperty());
    }

    @Test
    void clampsOversizedLimit() {
        when(courseRepository.findByIsPublishedTrue(any(Pageable.class)))
                .thenReturn(Page.empty());
        courseService.listPublishedCourses(null, 9999, 0, "updated_at", "desc");
        assertEquals(Pagination.MAX_SIZE, capturePageable().getPageSize());
    }

    @Test
    void unknownSortColumnFallsBackToUpdatedAt() {
        when(courseRepository.findByIsPublishedTrue(any(Pageable.class)))
                .thenReturn(Page.empty());
        courseService.listPublishedCourses(null, 10, 0, "garbage; DROP TABLE courses", "asc");
        assertEquals("updatedAt", capturePageable().getSort().toList().get(0).getProperty());
    }
}
