package com.fyp.backend.service;

import java.net.URI;
import java.util.List;

import org.springframework.stereotype.Service;

import com.fyp.backend.model.Announcement;
import com.fyp.backend.repository.AnnouncementRepository;

@Service
public class AnnouncementService {

    private final AnnouncementRepository announcementRepository;

    public AnnouncementService(AnnouncementRepository announcementRepository) {
        this.announcementRepository = announcementRepository;
    }

    public List<Announcement> getAllAnnouncements() {
        return announcementRepository.findAll();
    }

    public Announcement createAnnouncement(String title, String imageUrl, String announcementLink) {
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

        Announcement announcement = new Announcement(normalizedTitle, normalizedImageUrl, normalizedAnnouncementLink);
        return announcementRepository.save(announcement);
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

    public void deleteAnnouncement(Long id) {
        Announcement announcement = announcementRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Announcement not found"));

        // Remove from database
        announcementRepository.deleteById(id);
    }
}
