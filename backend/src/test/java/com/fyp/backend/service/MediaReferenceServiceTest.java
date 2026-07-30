package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fyp.backend.repository.AnnouncementRepository;
import com.fyp.backend.repository.CertificateRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.CourseResourceRepository;
import com.fyp.backend.repository.CourseVideoRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.QuizQuestionRepository;
import com.fyp.backend.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class MediaReferenceServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private AnnouncementRepository announcementRepository;
    @Mock private CourseRepository courseRepository;
    @Mock private CourseVideoRepository courseVideoRepository;
    @Mock private CourseResourceRepository courseResourceRepository;
    @Mock private QuizQuestionRepository quizQuestionRepository;
    @Mock private CertificateRepository certificateRepository;
    @Mock private MessageRepository messageRepository;
    @Mock private RedisService redisService;
    @InjectMocks private MediaReferenceService mediaReferenceService;

    @Test
    void profileLookupOnlyChecksPendingRegistrationAndUsers() {
        when(userRepository.existsByProfileImageContaining("anon_avatar.jpg")).thenReturn(true);

        assertTrue(mediaReferenceService.isReferenced("profile", "anon_avatar.jpg"));

        verify(redisService).isPendingRegistrationMedia("anon_avatar.jpg");
        verify(userRepository).existsByProfileImageContaining("anon_avatar.jpg");
        verifyNoInteractions(groupConversationRepository, announcementRepository, courseRepository,
                courseVideoRepository, courseResourceRepository, quizQuestionRepository,
                certificateRepository, messageRepository);
    }

    @Test
    void conversationLookupOnlyChecksMessages() {
        when(messageRepository.existsByContentContaining("voice.m4a")).thenReturn(true);

        assertTrue(mediaReferenceService.isReferenced("conversation", "voice.m4a"));

        verify(messageRepository).existsByContentContaining("voice.m4a");
        verifyNoInteractions(redisService, userRepository, groupConversationRepository,
                announcementRepository, courseRepository, courseVideoRepository,
                courseResourceRepository, quizQuestionRepository, certificateRepository);
    }

    @Test
    void eventMediaHasNoDatabaseReferenceQueries() {
        assertFalse(mediaReferenceService.isReferenced("event", "event.jpg"));

        verifyNoInteractions(redisService, userRepository, groupConversationRepository,
                announcementRepository, courseRepository, courseVideoRepository,
                courseResourceRepository, quizQuestionRepository, certificateRepository,
                messageRepository);
    }

    @Test
    void managedUrlInfersCourseReferenceScope() {
        String url = "https://cdn.example.com/coursePictures/u7_cover_abc.jpg?signature=secret";
        when(courseRepository.existsByThumbnailUrlContaining("u7_cover_abc.jpg")).thenReturn(true);

        assertTrue(mediaReferenceService.isReferencedByUrl(url));

        verify(courseRepository).existsByThumbnailUrlContaining("u7_cover_abc.jpg");
        verifyNoInteractions(redisService, userRepository, groupConversationRepository,
                announcementRepository, courseVideoRepository, courseResourceRepository,
                quizQuestionRepository, certificateRepository, messageRepository);
    }
}
