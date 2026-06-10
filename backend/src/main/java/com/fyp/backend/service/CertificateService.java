package com.fyp.backend.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.model.Certificate;
import com.fyp.backend.model.Course;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.CertificateRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Issues and lists completion certificates. Issuance is idempotent per
 * (user, course) so it can be called safely from every completion path.
 */
@Service
public class CertificateService {

    @Autowired private CertificateRepository certificateRepository;
    @Autowired private CourseRepository courseRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private ObjectMapper objectMapper;

    /** Returns the existing certificate or issues a new one. Never duplicates. */
    public Certificate issueForCompletion(Long userId, Long courseId) {
        return certificateRepository.findByUserIdAndCourseId(userId, courseId).orElseGet(() -> {
            Course course = courseRepository.findById(courseId).orElse(null);
            User user = userRepository.findById(userId).orElse(null);

            Certificate cert = new Certificate();
            cert.setUserId(userId);
            cert.setCourseId(courseId);
            cert.setCertificateNumber(generateNumber(courseId, userId));
            cert.setMetadata(writeMetadata(
                    course == null ? "Course" : course.getTitle(),
                    displayName(user)));
            return certificateRepository.save(cert);
        });
    }

    /** True if a fresh certificate was just created (vs. already existed). */
    public boolean issueIfAbsent(Long userId, Long courseId) {
        if (certificateRepository.existsByUserIdAndCourseId(userId, courseId)) return false;
        issueForCompletion(userId, courseId);
        return true;
    }

    public List<Map<String, Object>> getCertificates(Long userId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Certificate c : certificateRepository.findByUserIdOrderByIssuedAtDesc(userId)) {
            out.add(toMap(c));
        }
        return out;
    }

    private Map<String, Object> toMap(Certificate c) {
        Map<String, Object> meta = readMetadata(c.getMetadata());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(c.getId()));
        m.put("course_id", String.valueOf(c.getCourseId()));
        m.put("certificate_number", c.getCertificateNumber());
        m.put("credential_url", c.getCredentialUrl());
        m.put("issued_at", c.getIssuedAt());
        m.put("course_title", meta.getOrDefault("courseTitle", "Course"));
        m.put("user_name", meta.getOrDefault("userName", ""));
        return m;
    }

    private String generateNumber(Long courseId, Long userId) {
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
        return String.format("CERT-%d-%d-%s", courseId, userId, suffix);
    }

    private String displayName(User u) {
        if (u == null) return "";
        String name = ((u.getFirstName() == null ? "" : u.getFirstName()) + " "
                + (u.getLastName() == null ? "" : u.getLastName())).trim();
        return name.isEmpty() ? (u.getEmail() == null ? "" : u.getEmail()) : name;
    }

    private String writeMetadata(String courseTitle, String userName) {
        try {
            return objectMapper.writeValueAsString(Map.of(
                    "courseTitle", courseTitle == null ? "" : courseTitle,
                    "userName", userName == null ? "" : userName));
        } catch (Exception e) {
            return "{}";
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readMetadata(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            return objectMapper.readValue(json, Map.class);
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }
}
