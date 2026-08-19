package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fyp.backend.model.Announcement;
import com.fyp.backend.repository.AnnouncementRepository;

/**
 * Announcement editing: fields update in place under the same validation rules
 * as creation, and a REPLACED picture is cleaned up only after the update
 * commits — while an unchanged picture is never touched.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AnnouncementServiceTest {

    @Mock private AnnouncementRepository announcementRepository;
    @Mock private OssCleanupService ossCleanupService;

    @InjectMocks private AnnouncementService announcementService;

    private static final String OLD_IMAGE = "https://oss.example.com/announcementPictures/announcement_1.jpeg";
    private static final String NEW_IMAGE = "https://oss.example.com/announcementPictures/announcement_2.jpeg";

    private Announcement existing() {
        Announcement announcement = new Announcement("Old title", OLD_IMAGE, "");
        announcement.setId(5L);
        return announcement;
    }

    @Test
    void updateChangesFieldsAndCleansUpTheReplacedImage() {
        Announcement announcement = existing();
        when(announcementRepository.findById(5L)).thenReturn(Optional.of(announcement));
        when(announcementRepository.save(any(Announcement.class))).thenAnswer(inv -> inv.getArgument(0));

        Announcement updated = announcementService.updateAnnouncement(
                5L, " New title ", NEW_IMAGE, "https://pingan.org.sg/news");

        assertEquals("New title", updated.getTitle());
        assertEquals(NEW_IMAGE, updated.getImageUrl());
        assertEquals("https://pingan.org.sg/news", updated.getAnnouncementLink());
        verify(ossCleanupService).deleteAfterCommit(OLD_IMAGE);
    }

    @Test
    void updateWithTheSameImageNeverDeletesIt() {
        Announcement announcement = existing();
        when(announcementRepository.findById(5L)).thenReturn(Optional.of(announcement));
        when(announcementRepository.save(any(Announcement.class))).thenAnswer(inv -> inv.getArgument(0));

        announcementService.updateAnnouncement(5L, "New title", OLD_IMAGE, "");

        verify(ossCleanupService, never()).deleteAfterCommit(anyString());
    }

    @Test
    void updateAppliesTheSameValidationAsCreate() {
        Announcement announcement = existing();
        when(announcementRepository.findById(5L)).thenReturn(Optional.of(announcement));

        assertThrows(IllegalArgumentException.class,
                () -> announcementService.updateAnnouncement(5L, "  ", NEW_IMAGE, ""));
        assertThrows(IllegalArgumentException.class,
                () -> announcementService.updateAnnouncement(5L, "t".repeat(71), NEW_IMAGE, ""));
        assertThrows(IllegalArgumentException.class,
                () -> announcementService.updateAnnouncement(5L, "Title", NEW_IMAGE, "not-a-url"));
        verify(announcementRepository, never()).save(any(Announcement.class));
    }

    @Test
    void updatingAMissingAnnouncementFails() {
        when(announcementRepository.findById(99L)).thenReturn(Optional.empty());

        assertThrows(IllegalArgumentException.class,
                () -> announcementService.updateAnnouncement(99L, "Title", NEW_IMAGE, ""));
    }
}
