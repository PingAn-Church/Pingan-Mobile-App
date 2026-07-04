package com.fyp.backend.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.TestPropertySource;

import com.fyp.backend.model.CourseRating;

/**
 * Regression test for the visible-rating aggregate. The method must be declared
 * {@code List<Object[]>}: with a bare {@code Object[]} return type Spring Data
 * treats the query as a collection query and hands back a nested single-element
 * array, which silently zeroed course ratings on every recompute.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@TestPropertySource(properties = "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect")
class CourseRatingRepositoryTest {

    @Autowired private CourseRatingRepository ratingRepository;
    @Autowired private TestEntityManager em;

    private CourseRating rating(Long courseId, Long userId, int stars, String status) {
        CourseRating r = new CourseRating();
        r.setCourseId(courseId);
        r.setUserId(userId);
        r.setRating(stars);
        r.setReviewStatus(status);
        return em.persist(r);
    }

    @Test
    void visibleRatingSummaryReturnsFlatAvgAndCountRow() {
        rating(9L, 1L, 4, "visible");
        rating(9L, 2L, 2, "visible");
        rating(9L, 3L, 5, "hidden"); // must not count
        em.flush();

        List<Object[]> rows = ratingRepository.visibleRatingSummary(9L);

        assertEquals(1, rows.size());
        Object[] summary = rows.get(0);
        assertEquals(3.0, ((Number) summary[0]).doubleValue(), 0.0001);
        assertEquals(2L, ((Number) summary[1]).longValue());
    }

    @Test
    void visibleRatingSummaryReturnsZeroCountWhenNoVisibleRatings() {
        rating(9L, 1L, 5, "hidden");
        em.flush();

        List<Object[]> rows = ratingRepository.visibleRatingSummary(9L);

        assertEquals(1, rows.size());
        assertEquals(0L, ((Number) rows.get(0)[1]).longValue());
    }
}
