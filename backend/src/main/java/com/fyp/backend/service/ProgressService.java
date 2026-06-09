package com.fyp.backend.service;

import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fyp.backend.model.CourseEnrollment;
import com.fyp.backend.model.CourseResource;
import com.fyp.backend.model.CourseVideo;
import com.fyp.backend.model.UserModuleProgress;
import com.fyp.backend.repository.CourseEnrollmentRepository;
import com.fyp.backend.repository.CourseResourceRepository;
import com.fyp.backend.repository.CourseSectionRepository;
import com.fyp.backend.repository.CourseVideoRepository;
import com.fyp.backend.repository.ResourceProgressRepository;
import com.fyp.backend.repository.UserModuleProgressRepository;
import com.fyp.backend.repository.UserVideoProgressRepository;

/**
 * Single source of truth for course/module progress so the calculation stays
 * consistent across video/resource updates, quiz submission (P5) and enrollment
 * listings. Currently counts videos + resources; quizzes are folded in at P5.
 */
@Service
public class ProgressService {

    @Autowired private CourseVideoRepository videoRepository;
    @Autowired private CourseResourceRepository resourceRepository;
    @Autowired private CourseSectionRepository sectionRepository;
    @Autowired private UserVideoProgressRepository videoProgressRepository;
    @Autowired private ResourceProgressRepository resourceProgressRepository;
    @Autowired private UserModuleProgressRepository moduleProgressRepository;
    @Autowired private CourseEnrollmentRepository enrollmentRepository;

    /** Recomputes and persists the enrollment progress %, returns the new value. */
    public double recomputeCourseProgress(Long userId, Long courseId) {
        List<Long> videoIds = videoRepository.findByCourseIdOrderByOrderIndexAsc(courseId)
                .stream().map(CourseVideo::getId).collect(Collectors.toList());
        List<Long> resourceIds = resourceRepository.findByCourseIdOrderByOrderIndexAsc(courseId)
                .stream().map(CourseResource::getId).collect(Collectors.toList());

        int total = videoIds.size() + resourceIds.size();
        long completedVideos = videoIds.isEmpty() ? 0
                : videoProgressRepository.countByUserIdAndVideoIdInAndIsCompletedTrue(userId, videoIds);
        long completedResources = resourceIds.isEmpty() ? 0
                : resourceProgressRepository.countByUserIdAndResourceIdInAndIsCompletedTrue(userId, resourceIds);
        long completed = completedVideos + completedResources;

        double pct = total > 0 ? (completed * 100.0) / total : 0.0;
        pct = Math.round(pct * 100.0) / 100.0;

        CourseEnrollment enrollment = enrollmentRepository.findByUserIdAndCourseId(userId, courseId).orElse(null);
        if (enrollment != null) {
            enrollment.setProgressPercentage(pct);
            boolean done = pct >= 100.0;
            enrollment.setCompleted(done);
            enrollment.setCompletionDate(done ? (enrollment.getCompletionDate() != null
                    ? enrollment.getCompletionDate() : Instant.now()) : null);
            enrollment.setUpdatedAt(Instant.now());
            enrollment.setLastActivityAt(Instant.now());
            enrollmentRepository.save(enrollment);
        }
        return pct;
    }

    /** Marks a section complete when all its videos + resources are done. */
    public boolean recomputeModuleCompletion(Long userId, Long courseId, Long sectionId) {
        if (sectionId == null) return false;
        List<Long> videoIds = videoRepository.findBySectionIdOrderByOrderIndexAsc(sectionId)
                .stream().map(CourseVideo::getId).collect(Collectors.toList());
        List<Long> resourceIds = resourceRepository.findBySectionIdOrderByOrderIndexAsc(sectionId)
                .stream().map(CourseResource::getId).collect(Collectors.toList());

        int total = videoIds.size() + resourceIds.size();
        long completedVideos = videoIds.isEmpty() ? 0
                : videoProgressRepository.countByUserIdAndVideoIdInAndIsCompletedTrue(userId, videoIds);
        long completedResources = resourceIds.isEmpty() ? 0
                : resourceProgressRepository.countByUserIdAndResourceIdInAndIsCompletedTrue(userId, resourceIds);
        boolean complete = total > 0 && (completedVideos + completedResources) >= total;

        UserModuleProgress mp = moduleProgressRepository
                .findByUserIdAndCourseIdAndSectionId(userId, courseId, sectionId)
                .orElseGet(() -> {
                    UserModuleProgress m = new UserModuleProgress();
                    m.setUserId(userId);
                    m.setCourseId(courseId);
                    m.setSectionId(sectionId);
                    return m;
                });
        mp.setCompleted(complete);
        mp.setCompletedAt(complete ? Instant.now() : null);
        moduleProgressRepository.save(mp);
        return complete;
    }

    public long completedSectionCount(Long userId, Long courseId) {
        return moduleProgressRepository.countByUserIdAndCourseIdAndIsCompletedTrue(userId, courseId);
    }

    public long completedVideoCount(Long userId, Long courseId) {
        List<Long> videoIds = videoRepository.findByCourseIdOrderByOrderIndexAsc(courseId)
                .stream().map(CourseVideo::getId).collect(Collectors.toList());
        return videoIds.isEmpty() ? 0
                : videoProgressRepository.countByUserIdAndVideoIdInAndIsCompletedTrue(userId, videoIds);
    }

    public long sectionCount(Long courseId) {
        return sectionRepository.countByCourseId(courseId);
    }
}
