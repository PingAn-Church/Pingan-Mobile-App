package com.fyp.backend.service;

import java.net.URI;
import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.Announcement;
import com.fyp.backend.repository.AnnouncementRepository;

@Service
public class AnnouncementService {

    // The client shows a small carousel / capped admin list, so bound the query.
    private static final int MAX_ANNOUNCEMENTS = 20;

    private final AnnouncementRepository announcementRepository;
    private final OssCleanupService ossCleanupService;

    public AnnouncementService(AnnouncementRepository announcementRepository,
                               OssCleanupService ossCleanupService) {
        this.announcementRepository = announcementRepository;
        this.ossCleanupService = ossCleanupService;
    }

    public List<Announcement> getAllAnnouncements() {
        return announcementRepository
                .findAll(PageRequest.of(0, MAX_ANNOUNCEMENTS, Sort.by(Sort.Direction.DESC, "createdAt")))
                .getContent();
    }

    public Announcement createAnnouncement(String title, String imageUrl, String announcementLink) {
        Validated fields = validate(title, imageUrl, announcementLink);
        Announcement announcement = new Announcement(fields.title(), fields.imageUrl(), fields.link());
        return announcementRepository.save(announcement);
    }

    /**
     * Edits an announcement in place: text, link, and/or picture.
     *
     * A replaced picture always arrives under a NEW object key (the client
     * uploads replacements — including re-crops — as fresh files, which is what
     * lets CachedImage cache covers by path), so the old object is deleted once
     * the update commits. deleteAfterCommit still checks references, so an image
     * shared by another announcement survives.
     */
    @Transactional
    public Announcement updateAnnouncement(Long id, String title, String imageUrl, String announcementLink) {
        Announcement announcement = announcementRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Announcement not found."));

        Validated fields = validate(title, imageUrl, announcementLink);
        String previousImageUrl = announcement.getImageUrl();

        announcement.setTitle(fields.title());
        announcement.setImageUrl(fields.imageUrl());
        announcement.setAnnouncementLink(fields.link());
        Announcement saved = announcementRepository.save(announcement);

        if (previousImageUrl != null && !previousImageUrl.equals(fields.imageUrl())) {
            ossCleanupService.deleteAfterCommit(previousImageUrl);
        }
        return saved;
    }

    /** The create/update field rules, shared so the two paths cannot drift. */
    private record Validated(String title, String imageUrl, String link) {
    }

    private Validated validate(String title, String imageUrl, String announcementLink) {
        String normalizedTitle = title == null ? "" : title.trim();
        String normalizedImageUrl = imageUrl == null ? "" : imageUrl.trim();
        String normalizedAnnouncementLink = announcementLink == null ? "" : announcementLink.trim();

        if (normalizedTitle.isEmpty() || normalizedImageUrl.isEmpty()) {
            throw new IllegalArgumentException("Title and image are required.");
        }

        if (normalizedTitle.length() > 70) {
            throw new IllegalArgumentException("Title must be 70 characters or fewer.");
        }

        if (!normalizedAnnouncementLink.isEmpty() && !isValidHttpUrl(normalizedAnnouncementLink)) {
            throw new IllegalArgumentException("Announcement link must be a valid http:// or https:// URL.");
        }

        return new Validated(normalizedTitle, normalizedImageUrl, normalizedAnnouncementLink);
    }

    private boolean isValidHttpUrl(String value) {
        try {
            URI uri = URI.create(value);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            return ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                    && host != null
                    && !host.isBlank();
        } catch (Exception ex) {
            return false;
        }
    }

    @Transactional
    public void deleteAnnouncement(Long id) {
        Announcement announcement = announcementRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Announcement not found"));

        announcementRepository.delete(announcement);
        ossCleanupService.deleteAfterCommit(announcement.getImageUrl());
    }
}
