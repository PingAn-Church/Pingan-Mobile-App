package com.fyp.backend.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.Category;
import com.fyp.backend.model.Course;
import com.fyp.backend.model.CourseOutcome;
import com.fyp.backend.model.CourseResource;
import com.fyp.backend.model.CourseSection;
import com.fyp.backend.model.CourseVideo;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.CategoryRepository;
import com.fyp.backend.repository.CourseOutcomeRepository;
import com.fyp.backend.repository.CourseRatingRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.CourseResourceRepository;
import com.fyp.backend.repository.CourseSectionRepository;
import com.fyp.backend.repository.CourseVideoRepository;

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
    @Autowired private CourseService courseService;

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
        outcomeRepository.deleteAll(outcomeRepository.findByCourseIdOrderByOrderIndexAsc(courseId));
        resourceRepository.deleteAll(resourceRepository.findByCourseIdOrderByOrderIndexAsc(courseId));
        videoRepository.deleteAll(videoRepository.findByCourseIdOrderByOrderIndexAsc(courseId));
        ratingRepository.deleteAll(ratingRepository.findByCourseId(courseId));
        sectionRepository.deleteAll(sectionRepository.findByCourseIdOrderByOrderIndexAsc(courseId));
        courseRepository.delete(c);
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
            for (Course c : courseRepository.findByIsPublishedTrueAndCategoryId(id)) {
                c.setCategoryId(general.getId());
                courseRepository.save(c);
            }
            for (Course c : courseRepository.findAll()) {
                if (id.equals(c.getCategoryId())) {
                    c.setCategoryId(general.getId());
                    courseRepository.save(c);
                }
            }
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
        sectionRepository.delete(s);
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
