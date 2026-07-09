package com.fyp.backend.service;

import java.net.URL;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

import org.springframework.stereotype.Service;

import com.aliyun.oss.HttpMethod;
import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.model.GeneratePresignedUrlRequest;
import com.aliyun.oss.model.ListObjectsRequest;
import com.aliyun.oss.model.OSSObjectSummary;
import com.aliyun.oss.model.ObjectListing;
import com.fyp.backend.util.Pagination;

import io.github.cdimascio.dotenv.Dotenv;
import jakarta.annotation.PreDestroy;

@Service
public class OSSService {

    private final String publicEndpoint;
    private final String internalEndpoint;
    private final String accessKeyId;
    private final String accessKeySecret;
    private final String bucketName;

    // Singleton clients, created lazily so the app still boots without OSS credentials
    // (CI context tests, local dev without a .env). The public client signs URLs that
    // clients use from outside Alibaba's network — the signing endpoint becomes the URL
    // host. The internal client carries server-side traffic; on ECS it points at the
    // region's internal endpoint (free bandwidth), and falls back to the public endpoint
    // when ALIBABA_OSS_INTERNAL_ENDPOINT is unset (the -internal hostname only resolves
    // inside Alibaba Cloud).
    private volatile OSS publicClient;
    private volatile OSS internalClient;

    private static final Logger logger = Logger.getLogger(OSSService.class.getName());

    public OSSService() {
        // Load environment variables from .env file
        Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();

        this.publicEndpoint = dotenv.get("ALIBABA_OSS_ENDPOINT", System.getenv("ALIBABA_OSS_ENDPOINT"));
        String internal = dotenv.get("ALIBABA_OSS_INTERNAL_ENDPOINT",
                System.getenv("ALIBABA_OSS_INTERNAL_ENDPOINT"));
        this.internalEndpoint = (internal == null || internal.isBlank()) ? this.publicEndpoint : internal;
        this.accessKeyId = dotenv.get("ALIBABA_OSS_ACCESS_KEY_ID", System.getenv("ALIBABA_OSS_ACCESS_KEY_ID"));
        this.accessKeySecret = dotenv.get("ALIBABA_OSS_ACCESS_KEY_SECRET",
                System.getenv("ALIBABA_OSS_ACCESS_KEY_SECRET"));
        this.bucketName = dotenv.get("ALIBABA_OSS_BUCKET_NAME", System.getenv("ALIBABA_OSS_BUCKET_NAME"));
    }

    private OSS publicClient() {
        OSS client = publicClient;
        if (client == null) {
            synchronized (this) {
                if (publicClient == null) {
                    publicClient = new OSSClientBuilder().build(publicEndpoint, accessKeyId, accessKeySecret);
                }
                client = publicClient;
            }
        }
        return client;
    }

    private OSS internalClient() {
        OSS client = internalClient;
        if (client == null) {
            synchronized (this) {
                if (internalClient == null) {
                    internalClient = new OSSClientBuilder().build(internalEndpoint, accessKeyId, accessKeySecret);
                }
                client = internalClient;
            }
        }
        return client;
    }

    @PreDestroy
    void shutdownClients() {
        if (publicClient != null) {
            publicClient.shutdown();
        }
        if (internalClient != null) {
            internalClient.shutdown();
        }
    }

    public String getFolderPath(String fileType) {
        return switch (fileType) {
            case "profile" -> "userProfilePictures/";
            case "group" -> "groupProfilePictures/";
            case "document" -> "documents/";
            case "event" -> "eventPictures/";
            case "announcement" -> "announcementPictures/";
            case "course" -> "coursePictures/";
            case "other" -> "otherPictures/";
            default -> throw new IllegalArgumentException("Unsupported file type: " + fileType);
        };
    }

    /**
     * Generate a presigned URL for uploading (PUT method).
     */
    public URL generatePresignedUploadUrl(String objectKey, int expirationMinutes) {
        return generatePresignedUploadUrl(objectKey, expirationMinutes, "image/jpeg");
    }

    /**
     * Generate a presigned URL for uploading (PUT method) with custom Content-Type.
     */
    public URL generatePresignedUploadUrl(String objectKey, int expirationMinutes, String contentType) {
        try {
            Date expiration = new Date(System.currentTimeMillis() + expirationMinutes * 60 * 1000);
            GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(bucketName, objectKey,
                    HttpMethod.PUT);
            request.setExpiration(expiration);
            request.setContentType(contentType); // Content-Type is part of the signature

            URL signedUrl = publicClient().generatePresignedUrl(request);
            logger.info("Generated Presigned Upload URL with Content-Type " + contentType + ": " + signedUrl);
            return signedUrl;
        } catch (Exception e) {
            logger.severe("Error generating presigned upload URL: " + e.getMessage());
            throw new RuntimeException("Error generating presigned URL: " + e.getMessage(), e);
        }
    }

    /**
     * Generate a presigned URL for downloading (GET method).
     */
    public URL generatePresignedDownloadUrl(String objectKey, int expirationMinutes) {
        try {
            Date expiration = new Date(System.currentTimeMillis() + expirationMinutes * 60 * 1000);
            GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(bucketName, objectKey,
                    HttpMethod.GET);
            request.setExpiration(expiration);

            URL signedUrl = publicClient().generatePresignedUrl(request);
            logger.info("Generated Presigned Download URL: " + signedUrl);
            return signedUrl;
        } catch (Exception e) {
            logger.severe("Error generating presigned download URL: " + e.getMessage());
            throw new RuntimeException("Error generating presigned URL: " + e.getMessage(), e);
        }
    }

    public Map<String, Object> listObjectsPage(String fileType, int size, String marker) {
        List<String> pictureUrls = new ArrayList<>();
        int safeSize = Pagination.clampSize(size);

        try {
            String folderPath = getFolderPath(fileType);
            ListObjectsRequest request = new ListObjectsRequest(bucketName);
            request.setPrefix(folderPath);
            request.setMaxKeys(safeSize);
            if (marker != null && !marker.isBlank()) {
                request.setMarker(marker);
            }

            ObjectListing objectListing = internalClient().listObjects(request);
            for (OSSObjectSummary objectSummary : objectListing.getObjectSummaries()) {
                String objectKey = objectSummary.getKey();
                if (!objectKey.equals(folderPath)) {
                    URL signedUrl = generatePresignedDownloadUrl(objectKey, 60);
                    pictureUrls.add(signedUrl.toString());
                }
            }

            Map<String, Object> pagination = new LinkedHashMap<>();
            pagination.put("nextMarker", objectListing.getNextMarker());
            pagination.put("hasMore", objectListing.isTruncated());
            pagination.put("size", safeSize);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("success", true);
            body.put("data", pictureUrls);
            body.put("pagination", pagination);
            return body;
        } catch (Exception e) {
            logger.severe("Error listing objects page: " + e.getMessage());
            throw new RuntimeException("Error listing objects", e);
        }
    }

    public void deleteObject(String objectKey) {
        try {
            internalClient().deleteObject(bucketName, objectKey);
            logger.info("Deleted object: " + objectKey);
        } catch (Exception e) {
            logger.severe("Error deleting object: " + e.getMessage());
            throw new RuntimeException("Error deleting object", e);
        }
    }

    /** Object-key prefixes this app owns; used to avoid deleting externally-hosted URLs. */
    private static final List<String> MANAGED_PREFIXES = List.of(
            "userProfilePictures/", "groupProfilePictures/", "documents/",
            "eventPictures/", "announcementPictures/", "coursePictures/",
            "otherPictures/", "conversations/");

    /**
     * Best-effort delete of an OSS object given its stored public URL. No-op for blank
     * input or URLs that don't point at one of our managed folders, and never throws —
     * callers use this for cleanup that must not fail the surrounding operation.
     */
    public void deleteObjectByUrl(String url) {
        if (url == null || url.isBlank()) {
            return;
        }
        String objectKey;
        try {
            objectKey = new java.net.URL(url).getPath();
        } catch (Exception e) {
            objectKey = url; // Maybe already a raw object key.
        }
        if (objectKey.startsWith("/")) {
            objectKey = objectKey.substring(1);
        }
        final String key = objectKey;
        if (MANAGED_PREFIXES.stream().noneMatch(key::startsWith)) {
            logger.info("Skipping delete for unmanaged/external URL: " + url);
            return;
        }
        try {
            deleteObject(key);
        } catch (Exception e) {
            logger.warning("Failed to delete OSS object for URL " + url + ": " + e.getMessage());
        }
    }
}
