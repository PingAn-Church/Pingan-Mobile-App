package com.fyp.backend.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.TestPropertySource;

import com.fyp.backend.model.Course;

/** Verifies DB-side paging/filtering of published courses on in-memory H2. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@TestPropertySource(properties = "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect")
class CourseRepositoryTest {

    @Autowired private CourseRepository courseRepository;
    @Autowired private TestEntityManager em;

    private Course course(String title, boolean published) {
        Course c = new Course();
        c.setTitle(title);
        c.setPublished(published);
        c.setCreatedAt(Instant.now());
        c.setUpdatedAt(Instant.now());
        return em.persist(c);
    }

    @Test
    void findByIsPublishedTruePagesAndExcludesUnpublished() {
        course("Alpha", true);
        course("Bravo", true);
        course("Charlie", true);
        course("Draft", false);
        em.flush();

        Page<Course> firstPage = courseRepository.findByIsPublishedTrue(
                PageRequest.of(0, 2, Sort.by(Sort.Direction.ASC, "title")));

        assertEquals(3, firstPage.getTotalElements()); // unpublished excluded
        assertEquals(2, firstPage.getContent().size()); // page size honoured
        assertTrue(firstPage.hasNext());
        assertEquals("Alpha", firstPage.getContent().get(0).getTitle()); // sorted
    }
}
