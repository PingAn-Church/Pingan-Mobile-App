package com.fyp.backend.tools;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.fyp.backend.model.Category;
import com.fyp.backend.model.Course;
import com.fyp.backend.model.CourseOutcome;
import com.fyp.backend.model.CourseSection;
import com.fyp.backend.model.CourseVideo;
import com.fyp.backend.repository.CategoryRepository;
import com.fyp.backend.repository.CourseOutcomeRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.CourseSectionRepository;
import com.fyp.backend.repository.CourseVideoRepository;

/**
 * Seeds a sample published course so the catalog can be exercised end-to-end.
 * Enable with {@code app.seed.learning=true}; idempotent (only seeds when the
 * categories table is empty).
 */
@Component
@ConditionalOnProperty(name = "app.seed.learning", havingValue = "true")
public class LearningSeedRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(LearningSeedRunner.class);

    private final CategoryRepository categoryRepository;
    private final CourseRepository courseRepository;
    private final CourseSectionRepository sectionRepository;
    private final CourseVideoRepository videoRepository;
    private final CourseOutcomeRepository outcomeRepository;

    public LearningSeedRunner(CategoryRepository categoryRepository, CourseRepository courseRepository,
            CourseSectionRepository sectionRepository, CourseVideoRepository videoRepository,
            CourseOutcomeRepository outcomeRepository) {
        this.categoryRepository = categoryRepository;
        this.courseRepository = courseRepository;
        this.sectionRepository = sectionRepository;
        this.videoRepository = videoRepository;
        this.outcomeRepository = outcomeRepository;
    }

    @Override
    public void run(String... args) {
        if (categoryRepository.count() > 0) {
            log.info("[LearningSeed] categories already present; skipping seed");
            return;
        }

        Category tech = new Category();
        tech.setName("Technology");
        tech.setColor("#3B82F6");
        tech = categoryRepository.save(tech);

        Category faith = new Category();
        faith.setName("Faith");
        faith.setColor("#8B5CF6");
        categoryRepository.save(faith);

        Course course = new Course();
        course.setTitle("Intro to Spring Boot");
        course.setDescription("Learn the fundamentals of building REST APIs with Spring Boot.");
        course.setInstructorName("Pingan Instructor");
        course.setCategoryId(tech.getId());
        course.setDurationHours(2.5);
        course.setThumbnailUrl("https://picsum.photos/seed/springboot/400/250");
        course.setRating(4.5);
        course.setTotalRatings(12);
        course.setStudentCount(34);
        course.setPublished(true);
        course.setFeatured(true);
        course.setTags("spring,java,backend");
        course = courseRepository.save(course);

        outcomeRepository.save(outcome(course.getId(), "Understand Spring Boot project structure", 0));
        outcomeRepository.save(outcome(course.getId(), "Build and test a REST controller", 1));

        CourseSection s1 = section(course.getId(), "Getting Started", "Setup and first run", 0);
        s1 = sectionRepository.save(s1);
        videoRepository.save(video(course.getId(), s1.getId(), "Welcome & Setup",
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ", 360, 0, true));

        CourseSection s2 = section(course.getId(), "Building APIs", "Controllers and services", 1);
        s2 = sectionRepository.save(s2);
        videoRepository.save(video(course.getId(), s2.getId(), "Your First Controller",
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ", 540, 0, false));

        log.info("[LearningSeed] seeded sample course id={}", course.getId());
    }

    private CourseOutcome outcome(Long courseId, String text, int order) {
        CourseOutcome o = new CourseOutcome();
        o.setCourseId(courseId);
        o.setOutcome(text);
        o.setOrderIndex(order);
        return o;
    }

    private CourseSection section(Long courseId, String title, String description, int order) {
        CourseSection s = new CourseSection();
        s.setCourseId(courseId);
        s.setTitle(title);
        s.setDescription(description);
        s.setOrderIndex(order);
        return s;
    }

    private CourseVideo video(Long courseId, Long sectionId, String title, String url, int seconds, int order,
            boolean preview) {
        CourseVideo v = new CourseVideo();
        v.setCourseId(courseId);
        v.setSectionId(sectionId);
        v.setTitle(title);
        v.setVideoUrl(url);
        v.setDurationSeconds(seconds);
        v.setOrderIndex(order);
        v.setPreview(preview);
        return v;
    }
}
