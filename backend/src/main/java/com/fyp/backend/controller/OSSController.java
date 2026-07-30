package com.fyp.backend.controller;

import com.fyp.backend.service.MediaTokenService;
import com.fyp.backend.service.OSSService;
import com.fyp.backend.service.ConversationService;
import com.fyp.backend.service.MediaReferenceService;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;

import io.github.cdimascio.dotenv.Dotenv;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URL;
import java.text.Normalizer;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.logging.Logger;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/oss")
public class OSSController {

    private final OSSService ossService;
    private final MediaTokenService mediaTokenService;
    private final ConversationService conversationService;
    private final MediaReferenceService mediaReferenceService;
    private final UserRepository userRepository;

    // Download URLs point at the backend /media gateway by default (private bucket,
    // free internal OSS traffic); this flag is the emergency rollback to OSS presigned
    // URLs without a redeploy. Resolved like the app's other switches: Spring property
    // first (test-settable), then .env / process env, defaulting to enabled.
    private final boolean mediaGatewayEnabled;

    // Public backend origin used for signed /media URLs. In production Spring Boot sits
    // behind a reverse proxy, so request-host inference can produce localhost/internal
    // URLs unless the proxy headers are perfect. This explicit base keeps media links
    // stable for already-built clients.
    private final String mediaPublicBaseUrl;

    private static final Logger logger = Logger.getLogger(OSSController.class.getName());
    private static final java.util.Set<String> PUBLIC_DOWNLOAD_TYPES =
            java.util.Set.of("course", "announcement");
    private static final Pattern ANONYMOUS_PROFILE_FILE = Pattern.compile(
            "^anon_[A-Za-z0-9._-]+_[0-9a-f]{32}\\.(jpg|jpeg|png|webp|heic|gif)$",
            Pattern.CASE_INSENSITIVE);

    public OSSController(OSSService ossService, MediaTokenService mediaTokenService,
            ConversationService conversationService,
            MediaReferenceService mediaReferenceService,
            UserRepository userRepository,
            @Value("${MEDIA_GATEWAY_ENABLED:}") String mediaGatewayEnabledProperty,
            @Value("${MEDIA_PUBLIC_BASE_URL:}") String mediaPublicBaseUrlProperty) {
        this.ossService = ossService;
        this.mediaTokenService = mediaTokenService;
        this.conversationService = conversationService;
        this.mediaReferenceService = mediaReferenceService;
        this.userRepository = userRepository;

        Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();
        String flag = firstNonBlank(
                mediaGatewayEnabledProperty,
                dotenv.get("MEDIA_GATEWAY_ENABLED", System.getenv("MEDIA_GATEWAY_ENABLED")));
        this.mediaGatewayEnabled = flag == null || flag.isBlank() || Boolean.parseBoolean(flag);
        this.mediaPublicBaseUrl = normalizeBaseUrl(firstNonBlank(
                mediaPublicBaseUrlProperty,
                dotenv.get("MEDIA_PUBLIC_BASE_URL", System.getenv("MEDIA_PUBLIC_BASE_URL"))));
    }

    /**
     * Temporary download URL for an object: a signed /media gateway URL built from
     * MEDIA_PUBLIC_BASE_URL when configured, otherwise from the current request's
     * forwarded host, or a legacy OSS presigned URL when the gateway is disabled.
     */
    private String downloadUrlFor(String objectKey) {
        if (mediaGatewayEnabled) {
            UriComponentsBuilder builder = mediaPublicBaseUrl == null
                    ? ServletUriComponentsBuilder.fromCurrentContextPath()
                    : UriComponentsBuilder.fromUriString(mediaPublicBaseUrl);
            String base = builder
                    .path("/media/" + objectKey)
                    .build()
                    .toUriString();
            return base + "?" + mediaTokenService.mintQuery(objectKey);
        }
        return ossService.generatePresignedDownloadUrl(objectKey, 60).toString();
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private static String normalizeBaseUrl(String value) {
        String normalized = firstNonBlank(value);
        if (normalized == null) {
            return null;
        }
        return normalized.replaceAll("/+$", "");
    }

    private String normalizeFileName(String rawFileName) {
        String source = rawFileName == null ? "" : rawFileName;
        String fileName = source.replace("\\", "/");
        int lastSlash = fileName.lastIndexOf('/');
        if (lastSlash >= 0) {
            fileName = fileName.substring(lastSlash + 1);
        }

        String normalized = Normalizer.normalize(fileName, Normalizer.Form.NFKC)
                .trim()
                .replaceAll("[\\p{Z}\\s]+", "_")
                .replaceAll("[^A-Za-z0-9._-]", "_")
                .replaceAll("_+", "_");

        return normalized.isEmpty() ? "upload_" + System.currentTimeMillis() : normalized;
    }

    private String uniqueFileName(String normalizedFileName, Authentication authentication) {
        int dot = normalizedFileName.lastIndexOf('.');
        String stem = dot > 0 ? normalizedFileName.substring(0, dot) : normalizedFileName;
        String extension = dot > 0 ? normalizedFileName.substring(dot) : "";
        Long userId = authenticatedUserId(authentication);
        String owner = userId == null ? "anon" : "u" + userId;
        return owner + "_" + stem + "_" + UUID.randomUUID().toString().replace("-", "") + extension;
    }

    @GetMapping("/presigned-upload-url")
    public ResponseEntity<?> getPresignedUploadUrl(@RequestParam String fileName, @RequestParam String fileType,
            Authentication authentication) {
        try {
            if (!canUpload(fileType, authentication)) {
                return ResponseEntity.status(403).body("You are not allowed to upload this media type.");
            }
            String normalizedFileName = normalizeFileName(fileName);
            if (!isAllowedImageName(normalizedFileName)) {
                return ResponseEntity.badRequest().body("Only image uploads are allowed.");
            }
            // getFolderPath validates the destination prefix and throws on unknown types.
            // The signed URL is image/jpeg only; a hard byte-size cap would require switching
            // to OSS POST-policy uploads (not the presigned-PUT flow used here).
            String objectKey = ossService.getFolderPath(fileType) + uniqueFileName(normalizedFileName, authentication);
            URL presignedUrl = ossService.generatePresignedUploadUrl(objectKey, 10);
            return ResponseEntity.ok(presignedUrl.toString());
        } catch (IllegalArgumentException e) {
            logger.warning("Rejected OSS upload presign request: " + e.getMessage());
            return ResponseEntity.badRequest().body("Unsupported file type: " + fileType);
        } catch (Exception e) {
            logger.severe("Error generating OSS presigned upload URL: " + e.getMessage());
            return ResponseEntity.status(500).body("Error generating presigned URL");
        }
    }

    private static final java.util.Set<String> ALLOWED_IMAGE_EXTENSIONS =
            java.util.Set.of("jpg", "jpeg", "png", "webp", "heic", "gif");

    private boolean isAllowedImageName(String fileName) {
        int dot = fileName.lastIndexOf('.');
        if (dot < 0 || dot == fileName.length() - 1) {
            return false;
        }
        return ALLOWED_IMAGE_EXTENSIONS.contains(fileName.substring(dot + 1).toLowerCase());
    }

    @GetMapping("/presigned-download-url")
    public ResponseEntity<?> getPresignedDownloadUrl(
            @RequestParam String fileName,
            @RequestParam String fileType,
            @RequestParam(required = false) Long conversationId,
            Authentication authentication) {
        try {
            if (!canDownload(fileType, conversationId, authentication)) {
                return ResponseEntity.status(403).body("You are not allowed to download this media type.");
            }
            String objectKey = ossService.getFolderPath(fileType) + requireSimpleFileName(fileName);
            String downloadUrl = downloadUrlFor(objectKey);
            return ResponseEntity.ok(downloadUrl);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body("Invalid download request.");
        } catch (Exception e) {
            logger.severe("Error generating OSS download URL: " + e.getMessage());
            return ResponseEntity.status(500).body("Error generating presigned URL");
        }
    }

    @GetMapping("/public-download-url")
    public ResponseEntity<?> getPublicDownloadUrl(@RequestParam String fileName, @RequestParam String fileType) {
        try {
            if (!PUBLIC_DOWNLOAD_TYPES.contains(fileType)) {
                return ResponseEntity.status(403).body("This media type is not public.");
            }
            if (fileName == null || fileName.isBlank() || fileName.contains("/")
                    || fileName.contains("\\") || fileName.contains("..")) {
                return ResponseEntity.badRequest().body("Invalid file name.");
            }
            String objectKey = ossService.getFolderPath(fileType) + fileName;
            return ResponseEntity.ok(downloadUrlFor(objectKey));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body("Unsupported public file type.");
        } catch (Exception e) {
            logger.severe("Error generating public media URL: " + e.getMessage());
            return ResponseEntity.status(500).body("Error generating download URL");
        }
    }

    private boolean isAuthenticated(Authentication authentication) {
        return authentication != null
                && authentication.isAuthenticated()
                && !(authentication instanceof AnonymousAuthenticationToken);
    }

    private Long authenticatedUserId(Authentication authentication) {
        User user = authenticatedUser(authentication);
        return user == null ? null : user.getId();
    }

    private User authenticatedUser(Authentication authentication) {
        if (!isAuthenticated(authentication) || authentication.getName() == null) {
            return null;
        }
        return userRepository.findByEmail(authentication.getName())
                .filter(User::isActive)
                .filter(user -> !user.isDeletedAccount())
                .orElse(null);
    }

    private boolean hasRole(Authentication authentication, String role) {
        return isAuthenticated(authentication) && authentication.getAuthorities().stream()
                .anyMatch(authority -> ("ROLE_" + role).equals(authority.getAuthority()));
    }

    private boolean canUpload(String fileType, Authentication authentication) {
        return switch (fileType) {
            case "profile" -> true;
            case "group" -> hasRole(authentication, "VERIFIED");
            case "course", "document" -> hasRole(authentication, "INSTRUCTOR");
            case "event", "announcement", "other" -> hasRole(authentication, "ADMIN");
            default -> false;
        };
    }

    private boolean canDownload(String fileType, Long conversationId, Authentication authentication) {
        Long userId = authenticatedUserId(authentication);
        if (userId == null) {
            return false;
        }
        return switch (fileType) {
            case "profile" -> true;
            case "group" -> conversationId != null
                    && conversationService.isUserPartOfConversation(conversationId, userId);
            case "event", "other" -> hasRole(authentication, "ADMIN");
            case "document" -> hasRole(authentication, "INSTRUCTOR");
            // Public course covers and announcements must use /public-download-url.
            case "course", "announcement" -> false;
            default -> false;
        };
    }

    private String requireSimpleFileName(String fileName) {
        if (fileName == null || fileName.isBlank() || fileName.contains("/")
                || fileName.contains("\\") || fileName.contains("..")) {
            throw new IllegalArgumentException("Invalid file name");
        }
        return fileName;
    }

    @GetMapping("/list-pictures")
    public ResponseEntity<?> listAllPictures(
            @RequestParam String fileType,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String marker,
            Authentication authentication) {
        try {
            if (!canList(fileType, authentication)) {
                return ResponseEntity.status(403).body("You are not allowed to list this media type.");
            }
            Map<String, Object> page = ossService.listObjectsPage(fileType, size, marker);
            @SuppressWarnings("unchecked")
            List<String> objectKeys = (List<String>) page.get("data");
            page.put("data", objectKeys.stream().map(this::downloadUrlFor).toList());
            return ResponseEntity.ok(page);
        } catch (Exception e) {
            logger.severe("Error listing pictures: " + e.getMessage());
            return ResponseEntity.status(500).body("Error listing pictures");
        }
    }

    private boolean canList(String fileType, Authentication authentication) {
        return switch (fileType) {
            case "course", "document" -> hasRole(authentication, "INSTRUCTOR");
            case "event" -> authenticatedUserId(authentication) != null;
            case "announcement", "other" -> hasRole(authentication, "ADMIN");
            default -> false;
        };
    }

    @DeleteMapping("/delete")
    public ResponseEntity<?> deletePicture(@RequestParam String fileName, @RequestParam String fileType) {
        try {
            String safeFileName = requireSimpleFileName(fileName);
            if (mediaReferenceService.isReferenced(fileType, safeFileName)) {
                return ResponseEntity.status(409).body("This media is still in use.");
            }
            String objectKey = ossService.getFolderPath(fileType) + safeFileName;
            ossService.deleteObject(objectKey);
            return ResponseEntity.ok("Deleted successfully: " + safeFileName);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body("Invalid media.");
        } catch (Exception e) {
            logger.severe("Error deleting picture: " + e.getMessage());
            return ResponseEntity.status(500).body("Error deleting picture");
        }
    }

    @DeleteMapping("/own-upload")
    public ResponseEntity<?> deleteOwnUpload(@RequestParam String fileName,
                                             @RequestParam String fileType,
                                             Authentication authentication) {
        try {
            Long userId = authenticatedUserId(authentication);
            String safeFileName = requireSimpleFileName(fileName);
            if (userId == null || !safeFileName.startsWith("u" + userId + "_")
                    || !canUpload(fileType, authentication)) {
                return ResponseEntity.status(403).body("You do not own this upload.");
            }
            if (mediaReferenceService.isReferenced(fileType, safeFileName)) {
                return ResponseEntity.status(409).body("This upload is already in use.");
            }
            ossService.deleteObject(ossService.getFolderPath(fileType) + safeFileName);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body("Invalid upload.");
        } catch (Exception e) {
            logger.warning("Failed to clean up owned upload: " + e.getMessage());
            return ResponseEntity.status(500).body("Failed to clean up upload.");
        }
    }

    @DeleteMapping("/anonymous-upload")
    public ResponseEntity<?> deleteAnonymousUpload(@RequestParam String fileName,
                                                   @RequestParam String fileType) {
        try {
            String safeFileName = requireSimpleFileName(fileName);
            if (!"profile".equals(fileType)) {
                return ResponseEntity.status(403).body("Invalid anonymous upload.");
            }
            if (!ANONYMOUS_PROFILE_FILE.matcher(safeFileName).matches()) {
                return ResponseEntity.badRequest().body("Invalid anonymous upload.");
            }
            if (mediaReferenceService.isReferenced("profile", safeFileName)) {
                return ResponseEntity.status(409).body("This upload is already in use.");
            }
            ossService.deleteObject(ossService.getFolderPath(fileType) + safeFileName);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body("Invalid upload.");
        } catch (Exception e) {
            logger.warning("Failed to clean up anonymous upload: " + e.getMessage());
            return ResponseEntity.status(500).body("Failed to clean up upload.");
        }
    }

    @GetMapping("/conversations/presigned-upload-url")
    public ResponseEntity<?> getConversationUploadUrl(
            @RequestParam String fileName,
            @RequestParam Long conversationId,
            @RequestParam(required = false, defaultValue = "image/jpeg") String contentType,
            Authentication authentication
    ) {
        try {
            Long userId = authenticatedUserId(authentication);
            if (userId == null || !conversationService.isUserPartOfConversation(conversationId, userId)) {
                return ResponseEntity.status(403).body("You are not part of this conversation.");
            }
            String normalizedFileName = normalizeFileName(fileName);
            String normalizedContentType = contentType == null ? "image/jpeg" : contentType.trim();
            if (!isAllowedConversationMedia(normalizedFileName, normalizedContentType)) {
                return ResponseEntity.badRequest().body("Unsupported conversation media type.");
            }

            String objectKey = "conversations/" + conversationId + "/"
                    + uniqueFileName(normalizedFileName, authentication);
            URL presignedUrl = ossService.generatePresignedUploadUrl(objectKey, 10, normalizedContentType);
            return ResponseEntity.ok(presignedUrl.toString());
        } catch (Exception e) {
            logger.severe("Error generating conversation upload URL: " + e.getMessage());
            return ResponseEntity.status(500).body("Error generating upload URL");
        }
    }

    @GetMapping("/conversations/presigned-download-url")
    public ResponseEntity<?> getConversationDownloadUrl(
            @RequestParam String fileName,
            @RequestParam Long conversationId,
            Authentication authentication
    ) {
        try {
            Long userId = authenticatedUserId(authentication);
            if (userId == null || !conversationService.isUserPartOfConversation(conversationId, userId)) {
                return ResponseEntity.status(403).body("You are not part of this conversation.");
            }
            String objectKey = "conversations/" + conversationId + "/" + requireSimpleFileName(fileName);
            return ResponseEntity.ok(downloadUrlFor(objectKey));
        } catch (Exception e) {
            logger.severe("Error generating conversation download URL: " + e.getMessage());
            return ResponseEntity.status(500).body("Error generating download URL");
        }
    }

    @DeleteMapping("/conversations/own-upload")
    public ResponseEntity<?> deleteOwnConversationUpload(
            @RequestParam String fileName,
            @RequestParam Long conversationId,
            Authentication authentication) {
        try {
            Long userId = authenticatedUserId(authentication);
            String safeFileName = requireSimpleFileName(fileName);
            if (userId == null
                    || !safeFileName.startsWith("u" + userId + "_")
                    || !conversationService.isUserPartOfConversation(conversationId, userId)) {
                return ResponseEntity.status(403).body("You do not own this conversation upload.");
            }
            if (mediaReferenceService.isReferenced("conversation", safeFileName)) {
                return ResponseEntity.status(409).body("This upload is already in use.");
            }
            ossService.deleteObject("conversations/" + conversationId + "/" + safeFileName);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body("Invalid conversation upload.");
        } catch (Exception e) {
            logger.warning("Failed to clean up conversation upload: " + e.getMessage());
            return ResponseEntity.status(500).body("Failed to clean up upload.");
        }
    }

    private static final Map<String, Set<String>> CONVERSATION_MEDIA_EXTENSIONS = Map.of(
            "image/jpeg", Set.of("jpg", "jpeg"),
            "image/png", Set.of("png"),
            "image/webp", Set.of("webp"),
            "image/gif", Set.of("gif"),
            "audio/mp4", Set.of("m4a", "mp4"),
            "audio/webm", Set.of("webm"),
            "audio/mpeg", Set.of("mp3"),
            "audio/wav", Set.of("wav"));

    private boolean isAllowedConversationMedia(String fileName, String contentType) {
        int dot = fileName.lastIndexOf('.');
        if (dot < 0 || dot == fileName.length() - 1) {
            return false;
        }
        Set<String> extensions = CONVERSATION_MEDIA_EXTENSIONS.get(contentType.toLowerCase());
        return extensions != null && extensions.contains(fileName.substring(dot + 1).toLowerCase());
    }

}
