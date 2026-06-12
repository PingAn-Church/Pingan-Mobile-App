package com.fyp.backend.tools;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.model.Achievement;
import com.fyp.backend.model.Category;
import com.fyp.backend.model.Course;
import com.fyp.backend.model.CourseOutcome;
import com.fyp.backend.model.GoalTemplate;
import com.fyp.backend.model.CourseQuiz;
import com.fyp.backend.model.CourseResource;
import com.fyp.backend.model.CourseSection;
import com.fyp.backend.model.CourseVideo;
import com.fyp.backend.model.QuizQuestion;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.AchievementRepository;
import com.fyp.backend.repository.CategoryRepository;
import com.fyp.backend.repository.CourseOutcomeRepository;
import com.fyp.backend.repository.CourseQuizRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.GoalTemplateRepository;
import com.fyp.backend.repository.CourseResourceRepository;
import com.fyp.backend.repository.CourseSectionRepository;
import com.fyp.backend.repository.CourseVideoRepository;
import com.fyp.backend.repository.QuizQuestionRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Seeds a small demo e-learning catalogue (categories, two published courses
 * with sections, videos, resources, outcomes and a mixed-type quiz) so the
 * learner experience is immediately demoable without the authoring portal.
 *
 * Run once with: {@code mvnw spring-boot:run -Dspring-boot.run.arguments=--app.tool=seed-learning}
 * Idempotent: skips if the demo courses already exist.
 */
@Component
@ConditionalOnProperty(name = "app.tool", havingValue = "seed-learning")
public class LearningSeedTool implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LearningSeedTool.class);
    private static final String DEMO_SUFFIX = "(Demo)";

    private final ConfigurableApplicationContext context;
    private final ObjectMapper objectMapper;
    private final UserRepository userRepository;
    private final CategoryRepository categoryRepository;
    private final CourseRepository courseRepository;
    private final CourseSectionRepository sectionRepository;
    private final CourseVideoRepository videoRepository;
    private final CourseResourceRepository resourceRepository;
    private final CourseOutcomeRepository outcomeRepository;
    private final CourseQuizRepository quizRepository;
    private final QuizQuestionRepository questionRepository;
    private final AchievementRepository achievementRepository;
    private final GoalTemplateRepository goalTemplateRepository;

    public LearningSeedTool(ConfigurableApplicationContext context, ObjectMapper objectMapper,
            UserRepository userRepository, CategoryRepository categoryRepository, CourseRepository courseRepository,
            CourseSectionRepository sectionRepository, CourseVideoRepository videoRepository,
            CourseResourceRepository resourceRepository, CourseOutcomeRepository outcomeRepository,
            CourseQuizRepository quizRepository, QuizQuestionRepository questionRepository,
            AchievementRepository achievementRepository, GoalTemplateRepository goalTemplateRepository) {
        this.context = context;
        this.objectMapper = objectMapper;
        this.userRepository = userRepository;
        this.categoryRepository = categoryRepository;
        this.courseRepository = courseRepository;
        this.sectionRepository = sectionRepository;
        this.videoRepository = videoRepository;
        this.resourceRepository = resourceRepository;
        this.outcomeRepository = outcomeRepository;
        this.quizRepository = quizRepository;
        this.questionRepository = questionRepository;
        this.achievementRepository = achievementRepository;
        this.goalTemplateRepository = goalTemplateRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            seed();
            exit(0);
        } catch (Exception e) {
            log.error("Learning seed failed", e);
            exit(1);
        }
    }

    private void seed() {
        boolean alreadySeeded = courseRepository.findAll().stream()
                .anyMatch(c -> c.getTitle() != null && c.getTitle().endsWith(DEMO_SUFFIX));
        if (alreadySeeded) {
            log.info("Demo learning content already present; skipping seed.");
            return;
        }

        User instructor = resolveInstructor();
        Category programming = category("Programming", "#564BEB");
        Category cloud = category("Cloud", "#943FE4");

        Course spring = course("Spring Boot Fundamentals " + DEMO_SUFFIX,
                "Build production-ready REST APIs with Spring Boot 3 and JPA.",
                programming, instructor, 3.5, "java,spring,backend",
                "https://images.unsplash.com/photo-1517694712202-14dd9538aa97");
        outcomes(spring, List.of(
                "Stand up a Spring Boot service from scratch",
                "Model data with JPA entities and repositories",
                "Expose and secure REST endpoints"));

        CourseSection s1 = section(spring, "Getting Started", "Project setup and first run", 0);
        video(spring, s1, "Welcome & setup", "https://www.youtube.com/watch?v=9SGDpanrc8U", 480, 0, true);
        resource(spring, s1, "Setup checklist", "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", "pdf", 1);

        CourseSection s2 = section(spring, "Building APIs", "Controllers, services and a knowledge check", 1);
        video(spring, s2, "Your first controller", "https://www.youtube.com/watch?v=gJrjgg1KVL4", 720, 0, false);
        CourseQuiz quiz = quiz(spring, s2, "Spring Boot Basics Quiz", 50, 2);
        seedQuizQuestions(quiz);

        Course cloudCourse = course("Intro to Cloud " + DEMO_SUFFIX,
                "Core cloud concepts: compute, storage and networking.",
                cloud, instructor, 2.0, "cloud,devops",
                "https://images.unsplash.com/photo-1451187580459-43490279c0fa");
        outcomes(cloudCourse, List.of("Explain IaaS/PaaS/SaaS", "Describe object storage"));
        CourseSection cs1 = section(cloudCourse, "Cloud 101", "The big picture", 0);
        video(cloudCourse, cs1, "What is the cloud?", "https://www.youtube.com/watch?v=M988_fsOSWo", 600, 0, true);
        CourseQuiz cloudQuiz = quiz(cloudCourse, cs1, "Cloud Concepts Quiz", 60, null);
        question(cloudQuiz, "true-false", "Object storage is ideal for unstructured data.", null, "True", 0);

        programming.setCourseCount(1);
        cloud.setCourseCount(1);
        categoryRepository.save(programming);
        categoryRepository.save(cloud);

        seedAchievements();
        seedGoalTemplates();

        log.info("Seeded {} demo courses (instructor: {}).", 2,
                instructor == null ? "none" : instructor.getEmail());
    }

    private void seedGoalTemplates() {
        goalTemplate("Complete your first course", "Starter", "courses_completed", 1, 50);
        goalTemplate("Finish three courses", "Focused", "courses_completed", 3, 150);
        goalTemplate("Pass five quizzes", "Focused", "quizzes_passed", 5, 100);
        goalTemplate("Spend 120 minutes learning", "Starter", "minutes_spent", 120, 60);
    }

    private void goalTemplate(String label, String difficulty, String metric, int target, int reward) {
        if (goalTemplateRepository.findByLabelIgnoreCase(label).isPresent()) return;
        GoalTemplate t = new GoalTemplate();
        t.setLabel(label);
        t.setDifficulty(difficulty);
        t.setMetric(metric);
        t.setTargetValue(target);
        t.setRewardPoints(reward);
        t.setActive(true);
        goalTemplateRepository.save(t);
    }

    private void seedAchievements() {
        achievement("First Steps", "Complete your first course.", "footsteps", "courses_completed", 1, 50);
        achievement("Scholar", "Complete three courses.", "school", "courses_completed", 3, 150);
        achievement("Quiz Whiz", "Pass your first quiz.", "bulb", "quizzes_passed", 1, 30);
    }

    private void achievement(String name, String description, String icon, String metric, int threshold, int points) {
        if (achievementRepository.findByNameIgnoreCase(name).isPresent()) return;
        Achievement a = new Achievement();
        a.setName(name);
        a.setDescription(description);
        a.setIcon(icon);
        a.setType(metric);
        a.setCriteria(toJson(Map.of("metric", metric, "threshold", threshold)));
        a.setPoints(points);
        a.setActive(true);
        achievementRepository.save(a);
    }

    /** Use an existing admin/instructor (promoting them to instructor), else the first user. */
    private User resolveInstructor() {
        List<User> users = userRepository.findAll();
        User chosen = users.stream().filter(User::isInstructor).findFirst()
                .or(() -> users.stream().filter(User::isAdmin).findFirst())
                .or(() -> users.stream().findFirst())
                .orElse(null);
        if (chosen != null && !chosen.isInstructor()) {
            chosen.setInstructor(true);
            userRepository.save(chosen);
        }
        return chosen;
    }

    private Category category(String name, String color) {
        return categoryRepository.findByNameIgnoreCase(name).orElseGet(() -> {
            Category c = new Category();
            c.setName(name);
            c.setColor(color);
            return categoryRepository.save(c);
        });
    }

    private Course course(String title, String description, Category cat, User instructor,
            double hours, String tags, String thumb) {
        Course c = new Course();
        c.setTitle(title);
        c.setDescription(description);
        c.setCategoryId(cat.getId());
        if (instructor != null) {
            c.setInstructorId(instructor.getId());
            c.setInstructorName(displayName(instructor));
        }
        c.setDurationHours(hours);
        c.setTags(tags);
        c.setThumbnailUrl(thumb);
        c.setPublished(true);
        c.setFeatured(true);
        return courseRepository.save(c);
    }

    private void outcomes(Course course, List<String> texts) {
        int i = 0;
        for (String t : texts) {
            CourseOutcome o = new CourseOutcome();
            o.setCourseId(course.getId());
            o.setOutcome(t);
            o.setOrderIndex(i++);
            outcomeRepository.save(o);
        }
    }

    private CourseSection section(Course course, String title, String description, int order) {
        CourseSection s = new CourseSection();
        s.setCourseId(course.getId());
        s.setTitle(title);
        s.setDescription(description);
        s.setOrderIndex(order);
        return sectionRepository.save(s);
    }

    private void video(Course course, CourseSection section, String title, String url,
            int durationSeconds, int order, boolean preview) {
        CourseVideo v = new CourseVideo();
        v.setCourseId(course.getId());
        v.setSectionId(section.getId());
        v.setTitle(title);
        v.setVideoUrl(url);
        v.setDurationSeconds(durationSeconds);
        v.setPreview(preview);
        v.setOrderIndex(order);
        videoRepository.save(v);
    }

    private void resource(Course course, CourseSection section, String title, String url,
            String type, int order) {
        CourseResource r = new CourseResource();
        r.setCourseId(course.getId());
        r.setSectionId(section.getId());
        r.setTitle(title);
        r.setResourceUrl(url);
        r.setResourceType(type);
        r.setDownloadable(true);
        r.setOrderIndex(order);
        resourceRepository.save(r);
    }

    private CourseQuiz quiz(Course course, CourseSection section, String title, int passingScore, Integer maxAttempts) {
        CourseQuiz q = new CourseQuiz();
        q.setCourseId(course.getId());
        q.setSectionId(section.getId());
        q.setTitle(title);
        q.setPassingScore(passingScore);
        q.setMaxAttempts(maxAttempts);
        q.setOrderIndex(0);
        return quizRepository.save(q);
    }

    private void seedQuizQuestions(CourseQuiz quiz) {
        question(quiz, "multiple-choice",
                "Which annotation marks a Spring REST controller?",
                List.of("@Service", "@RestController", "@Entity", "@Repository"),
                "@RestController", 0);
        question(quiz, "multiple-correct",
                "Which are valid HTTP methods? (select all)",
                List.of("GET", "FETCH", "POST", "REMOVE"),
                List.of("GET", "POST"), 1);
        question(quiz, "true-false",
                "JPA repositories extend JpaRepository.", null, "True", 2);
        question(quiz, "short-answer",
                "What language is Spring Boot written in?", null, "Java", 3);
        question(quiz, "matching",
                "Match the protocol to its default port.", null,
                List.of(Map.of("left", "HTTP", "right", "80"), Map.of("left", "HTTPS", "right", "443")), 4);
    }

    private void question(CourseQuiz quiz, String type, String text, Object options, Object correct, int order) {
        QuizQuestion q = new QuizQuestion();
        q.setQuizId(quiz.getId());
        q.setQuestion(text);
        q.setQuestionType(type);
        q.setOptions(options == null ? null : toJson(options));
        q.setCorrectAnswer(correct instanceof String s ? s : toJson(correct));
        q.setPoints(1);
        q.setOrderIndex(order);
        questionRepository.save(q);
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return null;
        }
    }

    private String displayName(User u) {
        String name = ((u.getFirstName() == null ? "" : u.getFirstName()) + " "
                + (u.getLastName() == null ? "" : u.getLastName())).trim();
        return name.isEmpty() ? (u.getEmail() == null ? "Instructor" : u.getEmail()) : name;
    }

    private void exit(int code) {
        int exitCode = SpringApplication.exit(context, () -> code);
        System.exit(exitCode);
    }
}
