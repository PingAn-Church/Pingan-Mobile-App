//package com.fyp.backend.controller;
//
//import com.fyp.backend.service.OSSService;
//import org.springframework.http.ResponseEntity;
//import org.springframework.web.bind.annotation.*;
//
//import java.net.URL;
//
//@RestController
//@RequestMapping("/oss")
//public class OSSController {
//
//    private final OSSService ossService;
//
//    public OSSController(OSSService ossService) {
//        this.ossService = ossService;
//    }
//
//    @GetMapping("/presigned-upload-url")
//    public ResponseEntity<String> getPresignedUploadUrl(@RequestParam String fileName, @RequestParam String fileType) {
//        String objectKey = fileType + "/" + fileName;
//        URL presignedUrl = ossService.generatePresignedUploadUrl(objectKey, 60);
//        return ResponseEntity.ok(presignedUrl.toString());
//    }
//}

package com.fyp.backend.controller;

import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.model.OSSObjectSummary;
import com.aliyun.oss.model.ObjectListing;
import com.fyp.backend.service.OSSService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URL;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.logging.Logger;
import java.util.List;

@RestController
@RequestMapping("/oss")
public class OSSController {

    private final OSSService ossService;
    private static final Logger logger = Logger.getLogger(OSSController.class.getName());

    public OSSController(OSSService ossService) {
        this.ossService = ossService;
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
//            String objectKey = fileType + "/" + fileName;
            String objectKey = ossService.getFolderPath(fileType) + normalizedFileName;
            URL presignedUrl = ossService.generatePresignedUploadUrl(objectKey, 60);
            logger.info("Generated Presigned URL: " + presignedUrl);
            return ResponseEntity.ok(presignedUrl.toString());
        } catch (Exception e) {
            logger.severe("Error generating OSS presigned upload URL: " + e.getMessage());
            return ResponseEntity.status(500).body("Error generating presigned URL");
        }
    }

    @GetMapping("/presigned-download-url")
    public ResponseEntity<?> getPresignedDownloadUrl(@RequestParam String fileName, @RequestParam String fileType) {
        try {
            String objectKey = ossService.getFolderPath(fileType) + fileName;
            URL presignedUrl = ossService.generatePresignedDownloadUrl(objectKey, 60);
            logger.info("Generated Presigned Download URL: " + presignedUrl);
            return ResponseEntity.ok(presignedUrl.toString());
        } catch (Exception e) {
            logger.severe("Error generating OSS presigned download URL: " + e.getMessage());
            return ResponseEntity.status(500).body("Error generating presigned URL");
        }
    }

    @GetMapping("/list-pictures")
    public ResponseEntity<?> listAllPictures(@RequestParam String fileType) {
        try {
            List<String> pictureUrls = ossService.listAllObjects(fileType);
            return ResponseEntity.ok(pictureUrls);
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
            URL presignedUrl = ossService.generatePresignedDownloadUrl(objectKey, 60);
            return ResponseEntity.ok(presignedUrl.toString());
        } catch (Exception e) {
            logger.severe("Error generating conversation download URL: " + e.getMessage());
            return ResponseEntity.status(500).body("Error generating download URL");
        }
    }

}
