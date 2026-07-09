package com.fyp.backend.controller;

import com.fyp.backend.service.MediaTokenService;
import com.fyp.backend.service.OSSService;

import io.github.cdimascio.dotenv.Dotenv;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URL;
import java.text.Normalizer;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

@RestController
@RequestMapping("/oss")
public class OSSController {

    private final OSSService ossService;
    private final MediaTokenService mediaTokenService;

    // Download URLs point at the backend /media gateway by default (private bucket,
    // free internal OSS traffic); this flag is the emergency rollback to OSS presigned
    // URLs without a redeploy. Resolved like the app's other switches: Spring property
    // first (test-settable), then .env / process env, defaulting to enabled.
    private final boolean mediaGatewayEnabled;

    private static final Logger logger = Logger.getLogger(OSSController.class.getName());

    public OSSController(OSSService ossService, MediaTokenService mediaTokenService,
            @Value("${MEDIA_GATEWAY_ENABLED:}") String mediaGatewayEnabledProperty) {
        this.ossService = ossService;
        this.mediaTokenService = mediaTokenService;

        String flag = mediaGatewayEnabledProperty;
        if (flag == null || flag.isBlank()) {
            Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();
            flag = dotenv.get("MEDIA_GATEWAY_ENABLED", System.getenv("MEDIA_GATEWAY_ENABLED"));
        }
        this.mediaGatewayEnabled = flag == null || flag.isBlank() || Boolean.parseBoolean(flag);
    }

    /**
     * Temporary download URL for an object: a signed /media gateway URL built on this
     * request's host (apps talk to Spring Boot directly, so the resolve host IS the
     * media host), or a legacy OSS presigned URL when the gateway is disabled.
     */
    private String downloadUrlFor(String objectKey) {
        if (mediaGatewayEnabled) {
            String base = ServletUriComponentsBuilder.fromCurrentContextPath()
                    .path("/media/" + objectKey)
                    .build()
                    .toUriString();
            return base + "?" + mediaTokenService.mintQuery(objectKey);
        }
        return ossService.generatePresignedDownloadUrl(objectKey, 60).toString();
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

    @GetMapping("/presigned-upload-url")
    public ResponseEntity<?> getPresignedUploadUrl(@RequestParam String fileName, @RequestParam String fileType) {
        try {
            String normalizedFileName = normalizeFileName(fileName);
            if (!isAllowedImageName(normalizedFileName)) {
                return ResponseEntity.badRequest().body("Only image uploads are allowed.");
            }
            // getFolderPath validates the destination prefix and throws on unknown types.
            // The signed URL is image/jpeg only; a hard byte-size cap would require switching
            // to OSS POST-policy uploads (not the presigned-PUT flow used here).
            String objectKey = ossService.getFolderPath(fileType) + normalizedFileName;
            URL presignedUrl = ossService.generatePresignedUploadUrl(objectKey, 60);
            logger.info("Generated Presigned URL: " + presignedUrl);
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
    public ResponseEntity<?> getPresignedDownloadUrl(@RequestParam String fileName, @RequestParam String fileType) {
        try {
            String objectKey = ossService.getFolderPath(fileType) + fileName;
            String downloadUrl = downloadUrlFor(objectKey);
            logger.info("Generated download URL: " + downloadUrl);
            return ResponseEntity.ok(downloadUrl);
        } catch (Exception e) {
            logger.severe("Error generating OSS download URL: " + e.getMessage());
            return ResponseEntity.status(500).body("Error generating presigned URL");
        }
    }

    @GetMapping("/list-pictures")
    public ResponseEntity<?> listAllPictures(
            @RequestParam String fileType,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String marker) {
        try {
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

    @DeleteMapping("/delete")
    public ResponseEntity<?> deletePicture(@RequestParam String fileName, @RequestParam String fileType) {
        try {
            String objectKey = ossService.getFolderPath(fileType) + fileName;
            ossService.deleteObject(objectKey);
            return ResponseEntity.ok("Deleted successfully: " + fileName);
        } catch (Exception e) {
            logger.severe("Error deleting picture: " + e.getMessage());
            return ResponseEntity.status(500).body("Error deleting picture");
        }
    }

    @GetMapping("/conversations/presigned-upload-url")
    public ResponseEntity<?> getConversationUploadUrl(
            @RequestParam String fileName,
            @RequestParam Long conversationId,
            @RequestParam(required = false, defaultValue = "image/jpeg") String contentType
    ) {
        try {
            String normalizedFileName = normalizeFileName(fileName);
            String normalizedContentType = contentType == null ? "image/jpeg" : contentType.trim();
            logger.info("Conversation upload signing requested: rawFileName=[" + fileName + "], normalizedFileName=["
                    + normalizedFileName + "], conversationId=[" + conversationId + "], contentType=["
                    + normalizedContentType + "]");

            String objectKey = "conversations/" + conversationId + "/" + normalizedFileName;
            URL presignedUrl = ossService.generatePresignedUploadUrl(objectKey, 60, normalizedContentType);
            return ResponseEntity.ok(presignedUrl.toString());
        } catch (Exception e) {
            logger.severe("Error generating conversation upload URL: " + e.getMessage());
            return ResponseEntity.status(500).body("Error generating upload URL");
        }
    }

    @GetMapping("/conversations/presigned-download-url")
    public ResponseEntity<?> getConversationDownloadUrl(
            @RequestParam String fileName,
            @RequestParam Long conversationId
    ) {
        try {
            String objectKey = "conversations/" + conversationId + "/" + fileName;
            return ResponseEntity.ok(downloadUrlFor(objectKey));
        } catch (Exception e) {
            logger.severe("Error generating conversation download URL: " + e.getMessage());
            return ResponseEntity.status(500).body("Error generating download URL");
        }
    }

}
