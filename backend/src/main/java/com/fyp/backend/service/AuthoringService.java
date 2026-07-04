package com.fyp.backend.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.Category;
import com.fyp.backend.model.Course;
import com.fyp.backend.model.CourseOutcome;
import com.fyp.backend.model.CourseQuiz;
import com.fyp.backend.model.CourseResource;
import com.fyp.backend.model.CourseSection;
import com.fyp.backend.model.CourseVideo;
import com.fyp.backend.model.QuizQuestion;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.CategoryRepository;
import com.fyp.backend.repository.CourseEnrollmentRepository;
import com.fyp.backend.repository.CourseOutcomeRepository;
import com.fyp.backend.repository.CourseQuizRepository;
import com.fyp.backend.repository.CourseRatingRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.CourseResourceRepository;
import com.fyp.backend.repository.CourseSectionRepository;
import com.fyp.backend.repository.CourseVideoRepository;
import com.fyp.backend.repository.CourseWishlistRepository;
import com.fyp.backend.repository.QuizAttemptRepository;
import com.fyp.backend.repository.QuizQuestionRepository;
import com.fyp.backend.repository.ResourceProgressRepository;
import com.fyp.backend.repository.UserModuleProgressRepository;
import com.fyp.backend.repository.UserVideoProgressRepository;
import com.fyp.backend.util.Pagination;

import jakarta.persistence.criteria.Predicate;

/**
 * Write-side authoring logic for the in-app instructor/admin portal (P3).
 * Bodies are loosely-typed maps to match the mobile editor payloads; required
 * fields are validated and missing optional fields are left untouched on update.
 */
@Service
public class AuthoringService {

    @Autowired private CourseRepository courseRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private CourseSectionRepository sectionRepository;
    @Autowired private CourseVideoRepository videoRepository;
    @Autowired private CourseResourceRepository resourceRepository;
    @Autowired private CourseOutcomeRepository outcomeRepository;
    @Autowired private CourseRatingRepository ratingRepository;
    @Autowired private CourseQuizRepository quizRepository;
    @Autowired private QuizQuestionRepository questionRepository;
    @Autowired private QuizAttemptRepository attemptRepository;
    @Autowired private CourseEnrollmentRepository enrollmentRepository;
    @Autowired private CourseWishlistRepository wishlistRepository;
    @Autowired private UserVideoProgressRepository videoProgressRepository;
    @Autowired private ResourceProgressRepository resourceProgressRepository;
    @Autowired private UserModuleProgressRepository moduleProgressRepository;
    @Autowired private CourseService courseService;
    @Autowired private OSSService ossService;
    @Autowired private ObjectMapper objectMapper;

    // ---- courses --------------------------------------------------------

    public Map<String, Object> createCourse(User author, Map<String, Object> body) {
        String title = requireString(body, "title");
        Course c = new Course();
        c.setTitle(title);
        c.setDescription(str(body, "description", ""));
        c.setCategoryId(resolveCategoryId(body));
        c.setInstructorId(author.getId());
        c.setInstructorName(displayName(author));
        c.setDurationHours(dbl(body, "durationHours", 0.0));
        c.setThumbnailUrl(str(body, "thumbnailUrl", null));
        c.setTags(normalizeTags(body.get("tags")));
        c.setPublished(bool(body, "isPublished", false));
        c.setFeatured(bool(body, "isFeatured", false));
        c = courseRepository.save(c);
        return courseService.courseSummaryMap(c);
    }

    @Transactional
    public Map<String, Object> updateCourse(Long courseId, Map<String, Object> body) {
        Course c = courseRepository.findById(courseId)
                .orElseThrow(() -> ApiException.notFound("Course not found"));
        if (body.containsKey("title")) c.setTitle(requireString(body, "title"));
        if (body.containsKey("description")) c.setDescription(str(body, "description", ""));
        if (body.containsKey("category") || body.containsKey("categoryId") || body.containsKey("categoryName")) {
            c.setCategoryId(resolveCategoryId(body));
        }
        if (body.containsKey("durationHours")) c.setDurationHours(dbl(body, "durationHours", 0.0));
        if (body.containsKey("thumbnailUrl")) c.setThumbnailUrl(str(body, "thumbnailUrl", null));
        if (body.containsKey("tags")) c.setTags(normalizeTags(body.get("tags")));
        if (body.containsKey("isPublished")) c.setPublished(bool(body, "isPublished", false));
        if (body.containsKey("isFeatured")) c.setFeatured(bool(body, "isFeatured", false));
        c.setUpdatedAt(java.time.Instant.now());
        courseRepository.save(c);
        return courseService.courseSummaryMap(c);
    }

    @Transactional
    public void deleteCourse(Long courseId) {
        Course c = courseRepository.findById(courseId)
                .orElseThrow(() -> ApiException.notFound("Course not found"));
        for (CourseQuiz quiz : quizRepository.findByCourseIdOrderByOrderIndexAsc(courseId)) {
            deleteQuizCascade(quiz.getId());
        }

        // Per-learner progress rows are keyed by video/resource id, so collect
        // those ids before the lessons themselves are removed.
        List<CourseVideo> videos = videoRepository.findByCourseIdOrderByOrderIndexAsc(courseId);
        List<CourseResource> resources = resourceRepository.findByCourseIdOrderByOrderIndexAsc(courseId);

        // Collect OSS-hosted assets (cover + uploaded resource documents) before the
        // rows are gone, so they can be cleaned up once the DB deletes succeed.
        List<String> orphanedAssetUrls = new ArrayList<>();
        orphanedAssetUrls.add(c.getThumbnailUrl());
        resources.forEach(r -> orphanedAssetUrls.add(r.getResourceUrl()));
        List<Long> videoIds = videos.stream().map(CourseVideo::getId).collect(Collectors.toList());
        List<Long> resourceIds = resources.stream().map(CourseResource::getId).collect(Collectors.toList());
        if (!videoIds.isEmpty()) videoProgressRepository.deleteByVideoIdIn(videoIds);
        if (!resourceIds.isEmpty()) resourceProgressRepository.deleteByResourceIdIn(resourceIds);
        moduleProgressRepository.deleteByCourseId(courseId);
        enrollmentRepository.deleteByCourseId(courseId);
        wishlistRepository.deleteByCourseId(courseId);
        // Certificates are kept on purpose: they are records of past achievement.

        outcomeRepository.deleteAll(outcomeRepository.findByCourseIdOrderByOrderIndexAsc(courseId));
        resourceRepository.deleteAll(resources);
        videoRepository.deleteAll(videos);
        ratingRepository.deleteByCourseId(courseId);
        sectionRepository.deleteAll(sectionRepository.findByCourseIdOrderByOrderIndexAsc(courseId));
        courseRepository.delete(c);

        // DB deletes succeeded; remove the now-unreferenced OSS assets (best-effort).
        orphanedAssetUrls.forEach(ossService::deleteObjectByUrl);
    }

    @Transactional
    public void setOutcomes(Long courseId, List<String> outcomes) {
        requireCourse(courseId);
        outcomeRepository.deleteAll(outcomeRepository.findByCourseIdOrderByOrderIndexAsc(courseId));
        int i = 0;
        for (String text : outcomes) {
            if (text == null || text.isBlank()) continue;
            CourseOutcome o = new CourseOutcome();
            o.setCourseId(courseId);
            o.setOutcome(text.trim());
            o.setOrderIndex(i++);
            outcomeRepository.save(o);
        }
    }

    public Map<String, Object> courseStats(User requester, int page, int size, String q,
            Boolean published, String sortBy, String sortOrder) {
        int safePage = Pagination.clampPage(page);
        int safeSize = Pagination.clampSize(size);
        Sort.Direction dir = "asc".equalsIgnoreCase(sortOrder) ? Sort.Direction.ASC : Sort.Direction.DESC;
        Pageable pageable = PageRequest.of(safePage, safeSize,
                Sort.by(dir, courseSortProperty(sortBy)).and(Sort.by(Sort.Direction.DESC, "id")));
        Long instructorId = requester != null && !requester.isAdmin() ? requester.getId() : null;
        Page<Course> result = courseRepository.findAll(courseStatsFilter(q, published, instructorId), pageable);

        List<Long> courseIds = result.getContent().stream().map(Course::getId).collect(Collectors.toList());
        Map<Long, Object[]> statsByCourse = enrollmentRepository.statsByCourseIds(courseIds).stream()
                .collect(Collectors.toMap(row -> ((Number) row[0]).longValue(), row -> row));

        List<Map<String, Object>> data = new ArrayList<>();
        for (Course c : result.getContent()) {
            Object[] stats = statsByCourse.get(c.getId());
            long enrolled = stats != null && stats[1] instanceof Number n ? n.longValue() : 0;
            long completed = stats != null && stats[2] instanceof Number n ? n.longValue() : 0;
            double avgProgress = stats != null && stats[3] instanceof Number n ? n.doubleValue() : 0.0;

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", String.valueOf(c.getId()));
            m.put("title", c.getTitle());
            m.put("is_published", c.isPublished());
            m.put("enrolled_count", enrolled);
            m.put("completed_count", completed);
            m.put("completion_rate", enrolled > 0 ? Math.round(completed * 100.0 / enrolled) : 0);
            m.put("average_progress", enrolled > 0 ? Math.round(avgProgress * 10.0) / 10.0 : 0);
            m.put("rating", c.getRating());
            m.put("total_ratings", c.getTotalRatings());
            data.add(m);
        }

        return Pagination.envelope(data, result);
    }

    private Specification<Course> courseStatsFilter(String q, Boolean published, Long instructorId) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (published != null) {
                predicates.add(cb.equal(root.get("isPublished"), published));
            }
            if (instructorId != null) {
                predicates.add(cb.equal(root.get("instructorId"), instructorId));
            }
            String term = q == null ? "" : q.trim().toLowerCase();
            if (!term.isEmpty()) {
                String like = "%" + term + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), like),
                        cb.like(cb.lower(root.get("instructorName")), like)));
            }
            return predicates.isEmpty() ? cb.conjunction() : cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private String courseSortProperty(String sortBy) {
        String key = sortBy == null ? "updated_at" : sortBy;
        return switch (key) {
            case "title" -> "title";
            case "rating" -> "rating";
            case "student_count" -> "studentCount";
            case "created_at" -> "createdAt";
            default -> "updatedAt";
        };
    }

    // ---- categories -----------------------------------------------------

    public Map<String, Object> createCategory(Map<String, Object> body) {
        String name = requireString(body, "name");
        categoryRepository.findByNameIgnoreCase(name).ifPresent(c -> {
            throw ApiException.conflict("Category already exists");
        });
        Category cat = new Category();
        cat.setName(name);
        cat.setColor(str(body, "color", "#6366F1"));
        cat = categoryRepository.save(cat);
        return categoryMap(cat);
    }

    public Map<String, Object> updateCategory(Long id, Map<String, Object> body) {
        Category cat = categoryRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Category not found"));
        if (body.containsKey("name")) cat.setName(requireString(body, "name"));
        if (body.containsKey("color")) cat.setColor(str(body, "color", cat.getColor()));
        categoryRepository.save(cat);
        return categoryMap(cat);
    }

    @Transactional
    public void deleteCategory(Long id) {
        Category cat = categoryRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Category not found"));
        // Move courses to a "General" category before deleting.
        Category general = categoryRepository.findByNameIgnoreCase("General")
                .orElseGet(() -> {
                    Category g = new Category();
                    g.setName("General");
                    g.setColor("#6B7280");
                    return categoryRepository.save(g);
                });
        if (!general.getId().equals(id)) {
            courseRepository.moveCategory(id, general.getId());
            categoryRepository.delete(cat);
        }
    }

    // ---- sections -------------------------------------------------------

    public Map<String, Object> createSection(Map<String, Object> body) {
        Long courseId = requireLong(body, "courseId");
        requireCourse(courseId);
        CourseSection s = new CourseSection();
        s.setCourseId(courseId);
        s.setTitle(requireString(body, "title"));
        s.setDescription(str(body, "description", ""));
        s.setOrderIndex(intVal(body, "orderIndex", (int) sectionRepository.countByCourseId(courseId)));
        s = sectionRepository.save(s);
        return sectionMap(s);
    }

    public Map<String, Object> updateSection(Long id, Map<String, Object> body) {
        CourseSection s = sectionRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Section not found"));
        if (body.containsKey("title")) s.setTitle(requireString(body, "title"));
        if (body.containsKey("description")) s.setDescription(str(body, "description", ""));
        if (body.containsKey("orderIndex")) s.setOrderIndex(intVal(body, "orderIndex", s.getOrderIndex()));
        sectionRepository.save(s);
        return sectionMap(s);
    }

    @Transactional
    public void deleteSection(Long id) {
        CourseSection s = sectionRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Section not found"));
        videoRepository.deleteAll(videoRepository.findBySectionIdOrderByOrderIndexAsc(id));
        resourceRepository.deleteAll(resourceRepository.findBySectionIdOrderByOrderIndexAsc(id));
        for (CourseQuiz quiz : quizRepository.findBySectionIdOrderByOrderIndexAsc(id)) {
            deleteQuizCascade(quiz.getId());
        }
        sectionRepository.delete(s);
    }

    // ---- quizzes & questions -------------------------------------------

    public Map<String, Object> createQuiz(Map<String, Object> body) {
        Long courseId = requireLong(body, "courseId");
        requireCourse(courseId);
        CourseQuiz q = new CourseQuiz();
        q.setCourseId(courseId);
        q.setSectionId(optLong(body, "sectionId"));
        q.setTitle(requireString(body, "title"));
        q.setDescription(str(body, "description", ""));
        q.setPassingScore(intVal(body, "passingScore", 70));
        q.setTimeLimitMinutes(body.get("timeLimitMinutes") == null ? null : intVal(body, "timeLimitMinutes", 0));
        q.setMaxAttempts(body.get("maxAttempts") == null ? null : intVal(body, "maxAttempts", 3));
        q.setOrderIndex(intVal(body, "orderIndex", (int) quizRepository.countByCourseId(courseId)));
        q = quizRepository.save(q);
        return quizMap(q);
    }

    public Map<String, Object> updateQuiz(Long id, Map<String, Object> body) {
        CourseQuiz q = quizRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Quiz not found"));
        if (body.containsKey("title")) q.setTitle(requireString(body, "title"));
        if (body.containsKey("description")) q.setDescription(str(body, "description", ""));
        if (body.containsKey("passingScore")) q.setPassingScore(intVal(body, "passingScore", 70));
        if (body.containsKey("timeLimitMinutes"))
            q.setTimeLimitMinutes(body.get("timeLimitMinutes") == null ? null : intVal(body, "timeLimitMinutes", 0));
        if (body.containsKey("maxAttempts"))
            q.setMaxAttempts(body.get("maxAttempts") == null ? null : intVal(body, "maxAttempts", 3));
        if (body.containsKey("orderIndex")) q.setOrderIndex(intVal(body, "orderIndex", q.getOrderIndex()));
        if (body.containsKey("sectionId")) q.setSectionId(optLong(body, "sectionId"));
        quizRepository.save(q);
        return quizMap(q);
    }

    @Transactional
    public void deleteQuiz(Long id) {
        if (!quizRepository.existsById(id)) throw ApiException.notFound("Quiz not found");
        deleteQuizCascade(id);
    }

    private void deleteQuizCascade(Long quizId) {
        attemptRepository.deleteAll(attemptRepository.findByQuizIdIn(List.of(quizId)));
        questionRepository.deleteByQuizId(quizId);
        quizRepository.deleteById(quizId);
    }

    public Map<String, Object> createQuestion(Map<String, Object> body) {
        Long quizId = requireLong(body, "quizId");
        if (!quizRepository.existsById(quizId)) throw ApiException.notFound("Quiz not found");
        QuizQuestion q = new QuizQuestion();
        q.setQuizId(quizId);
        applyQuestionBody(q, body, true);
        q.setOrderIndex(intVal(body, "orderIndex", (int) questionRepository.countByQuizId(quizId)));
        q = questionRepository.save(q);
        return questionMap(q);
    }

    public Map<String, Object> updateQuestion(Long id, Map<String, Object> body) {
        QuizQuestion q = questionRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Question not found"));
        applyQuestionBody(q, body, false);
        if (body.containsKey("orderIndex")) q.setOrderIndex(intVal(body, "orderIndex", q.getOrderIndex()));
        questionRepository.save(q);
        return questionMap(q);
    }

    public void deleteQuestion(Long id) {
        if (!questionRepository.existsById(id)) throw ApiException.notFound("Question not found");
        questionRepository.deleteById(id);
    }

    private void applyQuestionBody(QuizQuestion q, Map<String, Object> body, boolean create) {
        if (create || body.containsKey("question")) q.setQuestion(requireString(body, "question"));
        if (create || body.containsKey("questionType")) q.setQuestionType(str(body, "questionType", "multiple-choice"));
        if (create || body.containsKey("options")) q.setOptions(toJson(body.get("options")));
        if (create || body.containsKey("correctAnswer")) q.setCorrectAnswer(toJsonOrString(body.get("correctAnswer")));
        if (body.containsKey("explanation")) q.setExplanation(str(body, "explanation", ""));
        if (body.containsKey("points")) q.setPoints(intVal(body, "points", 1));
        if (body.containsKey("imageUrl")) q.setImageUrl(str(body, "imageUrl", null));
    }

    // ---- videos ---------------------------------------------------------

    public Map<String, Object> createVideo(Map<String, Object> body) {
        Long courseId = requireLong(body, "courseId");
        requireCourse(courseId);
        CourseVideo v = new CourseVideo();
        v.setCourseId(courseId);
        v.setSectionId(optLong(body, "sectionId"));
        v.setTitle(requireString(body, "title"));
        v.setDescription(str(body, "description", ""));
        v.setVideoUrl(str(body, "videoUrl", ""));
        v.setDurationSeconds(intVal(body, "durationSeconds", 0));
        v.setThumbnailUrl(str(body, "thumbnailUrl", null));
        v.setPreview(bool(body, "isPreview", false));
        v.setOrderIndex(intVal(body, "orderIndex", 0));
        v = videoRepository.save(v);
        return videoMap(v);
    }

    public Map<String, Object> updateVideo(Long id, Map<String, Object> body) {
        CourseVideo v = videoRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Video not found"));
        if (body.containsKey("title")) v.setTitle(requireString(body, "title"));
        if (body.containsKey("description")) v.setDescription(str(body, "description", ""));
        if (body.containsKey("videoUrl")) v.setVideoUrl(str(body, "videoUrl", ""));
        if (body.containsKey("durationSeconds")) v.setDurationSeconds(intVal(body, "durationSeconds", 0));
        if (body.containsKey("thumbnailUrl")) v.setThumbnailUrl(str(body, "thumbnailUrl", null));
        if (body.containsKey("isPreview")) v.setPreview(bool(body, "isPreview", false));
        if (body.containsKey("orderIndex")) v.setOrderIndex(intVal(body, "orderIndex", v.getOrderIndex()));
        if (body.containsKey("sectionId")) v.setSectionId(optLong(body, "sectionId"));
        videoRepository.save(v);
        return videoMap(v);
    }

    public void deleteVideo(Long id) {
        if (!videoRepository.existsById(id)) throw ApiException.notFound("Video not found");
        videoRepository.deleteById(id);
    }

    // ---- resources ------------------------------------------------------

    public Map<String, Object> createResource(Map<String, Object> body) {
        Long courseId = requireLong(body, "courseId");
        requireCourse(courseId);
        CourseResource r = new CourseResource();
        r.setCourseId(courseId);
        r.setSectionId(optLong(body, "sectionId"));
        r.setTitle(requireString(body, "title"));
        r.setDescription(str(body, "description", ""));
        r.setResourceUrl(str(body, "resourceUrl", ""));
        r.setResourceType(str(body, "resourceType", "pdf"));
        r.setFileSizeBytes(optLong(body, "fileSizeBytes"));
        r.setDownloadable(bool(body, "isDownloadable", true));
        r.setPreview(bool(body, "isPreview", false));
        r.setOrderIndex(intVal(body, "orderIndex", 0));
        r.setEstimatedReadMinutes(estimateReadMinutes(r.getFileSizeBytes(), intVal(body, "estimatedReadMinutes", 0)));
        r = resourceRepository.save(r);
        return resourceMap(r);
    }

    public Map<String, Object> updateResource(Long id, Map<String, Object> body) {
        CourseResource r = resourceRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Resource not found"));
        if (body.containsKey("title")) r.setTitle(requireString(body, "title"));
        if (body.containsKey("description")) r.setDescription(str(body, "description", ""));
        if (body.containsKey("resourceUrl")) r.setResourceUrl(str(body, "resourceUrl", ""));
        if (body.containsKey("resourceType")) r.setResourceType(str(body, "resourceType", "pdf"));
        if (body.containsKey("fileSizeBytes")) r.setFileSizeBytes(optLong(body, "fileSizeBytes"));
        if (body.containsKey("isDownloadable")) r.setDownloadable(bool(body, "isDownloadable", true));
        if (body.containsKey("isPreview")) r.setPreview(bool(body, "isPreview", false));
        if (body.containsKey("orderIndex")) r.setOrderIndex(intVal(body, "orderIndex", r.getOrderIndex()));
        if (body.containsKey("sectionId")) r.setSectionId(optLong(body, "sectionId"));
        r.setEstimatedReadMinutes(estimateReadMinutes(r.getFileSizeBytes(), r.getEstimatedReadMinutes()));
        r.setUpdatedAt(java.time.Instant.now());
        resourceRepository.save(r);
        return resourceMap(r);
    }

    public void deleteResource(Long id) {
        if (!resourceRepository.existsById(id)) throw ApiException.notFound("Resource not found");
        resourceRepository.deleteById(id);
    }

    // ---- helpers --------------------------------------------------------

    private Course requireCourse(Long courseId) {
        return courseRepository.findById(courseId)
                .orElseThrow(() -> ApiException.notFound("Course not found"));
    }

    private Long resolveCategoryId(Map<String, Object> body) {
        Long catId = optLong(body, "categoryId");
        if (catId == null) catId = optLong(body, "category");
        if (catId != null && categoryRepository.existsById(catId)) return catId;
        String name = str(body, "categoryName", null);
        if (name != null && !name.isBlank()) {
            return categoryRepository.findByNameIgnoreCase(name.trim())
                    .map(Category::getId)
                    .orElseGet(() -> {
                        Category c = new Category();
                        c.setName(name.trim());
                        c.setColor("#6366F1");
                        return categoryRepository.save(c).getId();
                    });
        }
        return categoryRepository.findByNameIgnoreCase("General")
                .map(Category::getId)
                .orElseGet(() -> {
                    Category g = new Category();
                    g.setName("General");
                    g.setColor("#6B7280");
                    return categoryRepository.save(g).getId();
                });
    }

    private Integer estimateReadMinutes(Long fileSizeBytes, int provided) {
        if (provided > 0) return provided;
        if (fileSizeBytes == null || fileSizeBytes <= 0) return 0;
        // ~200KB/page, ~2 min/page (matches the source heuristic).
        return (int) Math.max(1, Math.round((fileSizeBytes / 204800.0) * 2));
    }

    private String normalizeTags(Object tags) {
        if (tags == null) return null;
        if (tags instanceof List<?> list) {
            return list.stream().map(String::valueOf).map(String::trim)
                    .filter(s -> !s.isEmpty()).reduce((a, b) -> a + "," + b).orElse("");
        }
        return String.valueOf(tags);
    }

    private String displayName(User u) {
        String name = ((u.getFirstName() == null ? "" : u.getFirstName()) + " "
                + (u.getLastName() == null ? "" : u.getLastName())).trim();
        return name.isEmpty() ? (u.getEmail() == null ? "Instructor" : u.getEmail()) : name;
    }

    private Map<String, Object> categoryMap(Category c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(c.getId()));
        m.put("name", c.getName());
        m.put("color", c.getColor());
        return m;
    }

    private Map<String, Object> sectionMap(CourseSection s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(s.getId()));
        m.put("course_id", String.valueOf(s.getCourseId()));
        m.put("title", s.getTitle());
        m.put("description", s.getDescription());
        m.put("order_index", s.getOrderIndex());
        return m;
    }

    private Map<String, Object> videoMap(CourseVideo v) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(v.getId()));
        m.put("course_id", String.valueOf(v.getCourseId()));
        m.put("section_id", v.getSectionId() == null ? null : String.valueOf(v.getSectionId()));
        m.put("title", v.getTitle());
        m.put("video_url", v.getVideoUrl());
        m.put("duration_seconds", v.getDurationSeconds());
        m.put("is_preview", v.isPreview());
        m.put("order_index", v.getOrderIndex());
        return m;
    }

    private Map<String, Object> quizMap(CourseQuiz q) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(q.getId()));
        m.put("course_id", String.valueOf(q.getCourseId()));
        m.put("section_id", q.getSectionId() == null ? null : String.valueOf(q.getSectionId()));
        m.put("title", q.getTitle());
        m.put("passing_score", q.getPassingScore());
        m.put("max_attempts", q.getMaxAttempts());
        m.put("order_index", q.getOrderIndex());
        return m;
    }

    private Map<String, Object> questionMap(QuizQuestion q) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(q.getId()));
        m.put("quiz_id", String.valueOf(q.getQuizId()));
        m.put("question", q.getQuestion());
        m.put("question_type", q.getQuestionType());
        m.put("options", parseJson(q.getOptions()));
        m.put("points", q.getPoints());
        m.put("order_index", q.getOrderIndex());
        return m;
    }

    private Object parseJson(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readValue(json, Object.class);
        } catch (Exception e) {
            return null;
        }
    }

    private String toJson(Object value) {
        if (value == null) return null;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return null;
        }
    }

    /** Lists/objects are JSON-encoded; plain scalars stored as-is. */
    private String toJsonOrString(Object value) {
        if (value == null) return null;
        if (value instanceof String s) return s;
        return toJson(value);
    }

    private Map<String, Object> resourceMap(CourseResource r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(r.getId()));
        m.put("course_id", String.valueOf(r.getCourseId()));
        m.put("section_id", r.getSectionId() == null ? null : String.valueOf(r.getSectionId()));
        m.put("title", r.getTitle());
        m.put("resource_url", r.getResourceUrl());
        m.put("resource_type", r.getResourceType());
        m.put("estimated_read_minutes", r.getEstimatedReadMinutes());
        m.put("order_index", r.getOrderIndex());
        return m;
    }

    // ---- body parsing ---------------------------------------------------

    private String requireString(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v == null || String.valueOf(v).isBlank()) {
            throw ApiException.badRequest(key + " is required");
        }
        return String.valueOf(v).trim();
    }

    private String str(Map<String, Object> body, String key, String def) {
        Object v = body.get(key);
        return v == null ? def : String.valueOf(v);
    }

    private Long requireLong(Map<String, Object> body, String key) {
        Long v = optLong(body, key);
        if (v == null) throw ApiException.badRequest(key + " is required");
        return v;
    }

    private Long optLong(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v == null) return null;
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private int intVal(Map<String, Object> body, String key, int def) {
        Object v = body.get(key);
        if (v == null) return def;
        try {
            return (int) Double.parseDouble(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private double dbl(Map<String, Object> body, String key, double def) {
        Object v = body.get(key);
        if (v == null) return def;
        try {
            return Double.parseDouble(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private boolean bool(Map<String, Object> body, String key, boolean def) {
        Object v = body.get(key);
        if (v == null) return def;
        if (v instanceof Boolean b) return b;
        return Boolean.parseBoolean(String.valueOf(v).trim());
    }
}
