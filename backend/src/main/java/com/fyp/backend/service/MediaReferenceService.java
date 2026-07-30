package com.fyp.backend.service;

import org.springframework.stereotype.Service;

import com.fyp.backend.repository.AnnouncementRepository;
import com.fyp.backend.repository.CertificateRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.CourseResourceRepository;
import com.fyp.backend.repository.CourseVideoRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.QuizQuestionRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Prevents a compensating delete from removing an object whose preceding DB
 * request committed even though the client timed out before receiving success.
 */
@Service
public class MediaReferenceService {

    private final UserRepository userRepository;
    private final GroupConversationRepository groupConversationRepository;
    private final AnnouncementRepository announcementRepository;
    private final CourseRepository courseRepository;
    private final CourseVideoRepository courseVideoRepository;
    private final CourseResourceRepository courseResourceRepository;
    private final QuizQuestionRepository quizQuestionRepository;
    private final CertificateRepository certificateRepository;
    private final MessageRepository messageRepository;
    private final RedisService redisService;

    public MediaReferenceService(UserRepository userRepository,
                                 GroupConversationRepository groupConversationRepository,
                                 AnnouncementRepository announcementRepository,
                                 CourseRepository courseRepository,
                                 CourseVideoRepository courseVideoRepository,
                                 CourseResourceRepository courseResourceRepository,
                                 QuizQuestionRepository quizQuestionRepository,
                                 CertificateRepository certificateRepository,
                                 MessageRepository messageRepository,
                                 RedisService redisService) {
        this.userRepository = userRepository;
        this.groupConversationRepository = groupConversationRepository;
        this.announcementRepository = announcementRepository;
        this.courseRepository = courseRepository;
        this.courseVideoRepository = courseVideoRepository;
        this.courseResourceRepository = courseResourceRepository;
        this.quizQuestionRepository = quizQuestionRepository;
        this.certificateRepository = certificateRepository;
        this.messageRepository = messageRepository;
        this.redisService = redisService;
    }

    public boolean isReferenced(String mediaType, String uniqueFileName) {
        if (uniqueFileName == null || uniqueFileName.isBlank()) {
            return false;
        }
        return switch (mediaType) {
            case "profile" -> redisService.isPendingRegistrationMedia(uniqueFileName)
                    || userRepository.existsByProfileImageContaining(uniqueFileName);
            case "group" -> groupConversationRepository.existsByGroupIconContaining(uniqueFileName);
            case "announcement" -> announcementRepository.existsByImageUrlContaining(uniqueFileName);
            case "course" -> courseRepository.existsByThumbnailUrlContaining(uniqueFileName);
            case "document" -> courseVideoRepository
                    .existsByVideoUrlContainingOrThumbnailUrlContaining(uniqueFileName, uniqueFileName)
                    || courseResourceRepository.existsByResourceUrlContaining(uniqueFileName)
                    || quizQuestionRepository.existsByImageUrlContaining(uniqueFileName)
                    || certificateRepository.existsByCredentialUrlContaining(uniqueFileName);
            case "conversation" -> messageRepository.existsByContentContaining(uniqueFileName);
            case "event", "other" -> false;
            default -> throw new IllegalArgumentException("Unsupported media type: " + mediaType);
        };
    }

    /**
     * Resolves the media type from a managed object URL/key. Unknown locations are
     * treated as referenced so cleanup fails closed.
     */
    public boolean isReferencedByUrl(String objectUrl) {
        String clean = objectUrl == null ? "" : objectUrl.split("[?#]", 2)[0].replace('\\', '/');
        String mediaType = mediaTypeForLocation(clean);
        int slash = clean.lastIndexOf('/');
        String fileName = slash >= 0 ? clean.substring(slash + 1) : clean;
        return mediaType == null || fileName.isBlank() || isReferenced(mediaType, fileName);
    }

    private String mediaTypeForLocation(String location) {
        if (containsPath(location, "userProfilePictures/")) return "profile";
        if (containsPath(location, "groupProfilePictures/")) return "group";
        if (containsPath(location, "documents/")) return "document";
        if (containsPath(location, "eventPictures/")) return "event";
        if (containsPath(location, "announcementPictures/")) return "announcement";
        if (containsPath(location, "coursePictures/")) return "course";
        if (containsPath(location, "otherPictures/")) return "other";
        if (containsPath(location, "conversations/")) return "conversation";
        return null;
    }

    private boolean containsPath(String location, String prefix) {
        return location.startsWith(prefix) || location.contains("/" + prefix);
    }
}
