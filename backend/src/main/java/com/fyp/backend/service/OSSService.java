////package com.fyp.backend.service;
////
////import com.aliyun.oss.*;
////import com.aliyun.oss.common.auth.DefaultCredentialProvider;
////import com.aliyun.oss.common.comm.SignVersion;
////import com.aliyun.oss.model.GeneratePresignedUrlRequest;
////import org.springframework.beans.factory.annotation.Value;
////import org.springframework.stereotype.Service;
////
////import java.net.URL;
////import java.util.Date;
////
////@Service
////public class OSSService {
////
////    @Value("${alibaba.oss.endpoint}")
////    private String endpoint;
////
////    @Value("${alibaba.oss.accessKeyId}")
////    private String accessKeyId;
////
////    @Value("${alibaba.oss.accessKeySecret}")
////    private String accessKeySecret;
////
////    @Value("${alibaba.oss.bucketName}")
////    private String bucketName;
////
////    @Value("${alibaba.oss.region}")
////    private String region;
////
////    public OSSService() {}
////
////    /**
////     * Generate a presigned URL for uploading (PUT method).
////     */
////    public URL generatePresignedUploadUrl(String objectKey, int expirationMinutes) {
////        ClientBuilderConfiguration clientBuilderConfiguration = new ClientBuilderConfiguration();
////        clientBuilderConfiguration.setSignatureVersion(SignVersion.V4);
////
////        OSS ossClient = OSSClientBuilder.create()
////                .endpoint(endpoint)
////                .credentialsProvider(new DefaultCredentialProvider(accessKeyId, accessKeySecret))
////                .clientConfiguration(clientBuilderConfiguration)
////                .region(region)
////                .build();
////
////        try {
////            Date expiration = new Date(System.currentTimeMillis() + expirationMinutes * 60 * 1000);
////            GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(bucketName, objectKey, HttpMethod.PUT);
////            request.setExpiration(expiration);
////
////            return ossClient.generatePresignedUrl(request);
////        } catch (Exception e) {
////            throw new RuntimeException("Error generating presigned URL: " + e.getMessage(), e);
////        } finally {
////            ossClient.shutdown();
////        }
////    }
////}
//
//package com.fyp.backend.service;
//
//import com.aliyun.oss.*;
//import com.aliyun.oss.common.auth.DefaultCredentialProvider;
//import com.aliyun.oss.common.comm.SignVersion;
//import com.aliyun.oss.model.GeneratePresignedUrlRequest;
//import org.springframework.beans.factory.annotation.Value;
//import org.springframework.stereotype.Service;
//
//import java.net.URL;
//import java.util.Date;
//import java.util.logging.Logger;
//
//@Service
//public class OSSService {
//
//    @Value("${alibaba.oss.endpoint}")
//    private String endpoint;
//
//    @Value("${alibaba.oss.accessKeyId}")
//    private String accessKeyId;
//
//    @Value("${alibaba.oss.accessKeySecret}")
//    private String accessKeySecret;
//
//    @Value("${alibaba.oss.bucketName}")
//    private String bucketName;
//
//    @Value("${alibaba.oss.region}")
//    private String region;
//
//    private static final Logger logger = Logger.getLogger(OSSService.class.getName());
//
//    public OSSService() {}
//
//    /**
//     * Generate a presigned URL for uploading (PUT method).
//     */
//    public URL generatePresignedUploadUrl(String objectKey, int expirationMinutes) {
//        ClientBuilderConfiguration clientBuilderConfiguration = new ClientBuilderConfiguration();
//        clientBuilderConfiguration.setSignatureVersion(SignVersion.V4);
//
//        OSS ossClient = OSSClientBuilder.create()
//                .endpoint(endpoint)
//                .credentialsProvider(new DefaultCredentialProvider(accessKeyId, accessKeySecret))
//                .clientConfiguration(clientBuilderConfiguration)
//                .region(region)
//                .build();
//
//        try {
//            Date expiration = new Date(System.currentTimeMillis() + expirationMinutes * 60 * 1000);
//            GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(bucketName, objectKey, HttpMethod.PUT);
//            request.setExpiration(expiration);
//
//            URL signedUrl = ossClient.generatePresignedUrl(request);
//            logger.info("Generated Presigned Upload URL: " + signedUrl);
//            return signedUrl;
//        } catch (Exception e) {
//            logger.severe("Error generating presigned upload URL: " + e.getMessage());
//            throw new RuntimeException("Error generating presigned URL: " + e.getMessage(), e);
//        } finally {
//            ossClient.shutdown();
//        }
//    }
//}
//
//package com.fyp.backend.service;
//
//import com.aliyun.oss.*;
//import com.aliyun.oss.common.auth.DefaultCredentialProvider;
//import com.aliyun.oss.common.comm.SignVersion;
//import com.aliyun.oss.model.GeneratePresignedUrlRequest;
//import org.springframework.beans.factory.annotation.Value;
//import org.springframework.stereotype.Service;
//
//import java.net.URL;
//import java.util.Date;
//import java.util.logging.Logger;
//
//@Service
//public class OSSService {
//
//    @Value("${alibaba.oss.endpoint}")
//    private String endpoint;
//
//    @Value("${alibaba.oss.accessKeyId}")
//    private String accessKeyId;
//
//    @Value("${alibaba.oss.accessKeySecret}")
//    private String accessKeySecret;
//
//    @Value("${alibaba.oss.bucketName}")
//    private String bucketName;
//
//    @Value("${alibaba.oss.region}")
//    private String region;
//
//    private static final Logger logger = Logger.getLogger(OSSService.class.getName());
//
//    public OSSService() {}
//
//    /**
//     * Generate a presigned URL for uploading (PUT method).
//     */
//    public URL generatePresignedUploadUrl(String objectKey, int expirationMinutes) {
//        ClientBuilderConfiguration clientBuilderConfiguration = new ClientBuilderConfiguration();
//        clientBuilderConfiguration.setSignatureVersion(SignVersion.V4); // Ensure correct signature version
//
//        OSS ossClient = OSSClientBuilder.create()
//                .endpoint(endpoint)
//                .credentialsProvider(new DefaultCredentialProvider(accessKeyId, accessKeySecret))
//                .clientConfiguration(clientBuilderConfiguration)
//                .region(region)
//                .build();
//
//        try {
//            Date expiration = new Date(System.currentTimeMillis() + expirationMinutes * 60 * 1000);
//            GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(bucketName, objectKey, HttpMethod.PUT);
//            request.setExpiration(expiration);
//
//            // ✅ Ensure Content-Type is included in the signature
//            request.setContentType("image/jpeg");
//
//            URL signedUrl = ossClient.generatePresignedUrl(request);
//            logger.info("Generated Presigned Upload URL: " + signedUrl);
//            return signedUrl;
//        } catch (Exception e) {
//            logger.severe("Error generating presigned upload URL: " + e.getMessage());
//            throw new RuntimeException("Error generating presigned URL: " + e.getMessage(), e);
//        } finally {
//            ossClient.shutdown();
//        }
//    }
//}

//
//package com.fyp.backend.service;
//
//import com.aliyun.oss.*;
//import com.aliyun.oss.common.auth.DefaultCredentialProvider;
//import com.aliyun.oss.common.comm.SignVersion;
//import com.aliyun.oss.model.GeneratePresignedUrlRequest;
//import org.springframework.beans.factory.annotation.Value;
//import org.springframework.stereotype.Service;
//
//import java.net.URL;
//import java.util.Date;
//import java.util.logging.Logger;
//
//@Service
//public class OSSService {
//
//    @Value("${alibaba.oss.endpoint}")
//    private String endpoint;
//
//    @Value("${alibaba.oss.accessKeyId}")
//    private String accessKeyId;
//
//    @Value("${alibaba.oss.accessKeySecret}")
//    private String accessKeySecret;
//
//    @Value("${alibaba.oss.bucketName}")
//    private String bucketName;
//
//    @Value("${alibaba.oss.region}")
//    private String region;
//
//    private static final Logger logger = Logger.getLogger(OSSService.class.getName());
//
//    public OSSService() {}
//
//    /**
//     * Generate a presigned URL for uploading (PUT method).
//     */
//    public URL generatePresignedUploadUrl(String objectKey, int expirationMinutes) {
//        ClientBuilderConfiguration clientBuilderConfiguration = new ClientBuilderConfiguration();
//        clientBuilderConfiguration.setSignatureVersion(SignVersion.V4); // ✅ Ensure correct signing version
//
//        OSS ossClient = new OSSClientBuilder().build(endpoint, accessKeyId, accessKeySecret);
//
//        try {
//            Date expiration = new Date(System.currentTimeMillis() + expirationMinutes * 60 * 1000);
//            GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(bucketName, objectKey, HttpMethod.PUT);
//            request.setExpiration(expiration);
//
//            // ✅ Ensure Content-Type is signed in the request
//            request.setContentType("image/jpeg");
//
//            URL signedUrl = ossClient.generatePresignedUrl(request);
//            logger.info("Generated Presigned Upload URL: " + signedUrl);
//            return signedUrl;
//        } catch (Exception e) {
//            logger.severe("Error generating presigned upload URL: " + e.getMessage());
//            throw new RuntimeException("Error generating presigned URL: " + e.getMessage(), e);
//        } finally {
//            ossClient.shutdown();
//        }
//    }
//}

package com.fyp.backend.service;

import java.net.URL;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.logging.Logger;

import org.springframework.stereotype.Service;

import com.aliyun.oss.ClientBuilderConfiguration; // ✅ Import dotenv for environment variables
import com.aliyun.oss.HttpMethod;
import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.common.comm.SignVersion;
import com.aliyun.oss.model.GeneratePresignedUrlRequest;
import com.aliyun.oss.model.OSSObjectSummary;
import com.aliyun.oss.model.ObjectListing;

import io.github.cdimascio.dotenv.Dotenv;

@Service
public class OSSService {

    private final String endpoint;
    private final String accessKeyId;
    private final String accessKeySecret;
    private final String bucketName;
    private final String region;

    private static final Logger logger = Logger.getLogger(OSSService.class.getName());

    public OSSService() {
        // ✅ Load environment variables from .env file
        Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();

        this.endpoint = dotenv.get("ALIBABA_OSS_ENDPOINT", System.getenv("ALIBABA_OSS_ENDPOINT"));
        this.accessKeyId = dotenv.get("ALIBABA_OSS_ACCESS_KEY_ID", System.getenv("ALIBABA_OSS_ACCESS_KEY_ID"));
        this.accessKeySecret = dotenv.get("ALIBABA_OSS_ACCESS_KEY_SECRET",
                System.getenv("ALIBABA_OSS_ACCESS_KEY_SECRET"));
        this.bucketName = dotenv.get("ALIBABA_OSS_BUCKET_NAME", System.getenv("ALIBABA_OSS_BUCKET_NAME"));
        this.region = dotenv.get("ALIBABA_OSS_REGION", System.getenv("ALIBABA_OSS_REGION"));

        // if (this.endpoint == null || this.accessKeyId == null || this.accessKeySecret
        // == null || this.bucketName == null || this.region == null) {
        // throw new IllegalStateException("OSS credentials are missing. Check your .env
        // file.");
        // }
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
        ClientBuilderConfiguration clientBuilderConfiguration = new ClientBuilderConfiguration();
        clientBuilderConfiguration.setSignatureVersion(SignVersion.V4);

        OSS ossClient = new OSSClientBuilder().build(endpoint, accessKeyId, accessKeySecret);

        try {
            Date expiration = new Date(System.currentTimeMillis() + expirationMinutes * 60 * 1000);
            GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(bucketName, objectKey,
                    HttpMethod.PUT);
            request.setExpiration(expiration);
            request.setContentType(contentType); // ✅ Use provided Content-Type

            URL signedUrl = ossClient.generatePresignedUrl(request);
            logger.info("Generated Presigned Upload URL with Content-Type " + contentType + ": " + signedUrl);
            return signedUrl;
        } catch (Exception e) {
            logger.severe("Error generating presigned upload URL: " + e.getMessage());
            throw new RuntimeException("Error generating presigned URL: " + e.getMessage(), e);
        } finally {
            ossClient.shutdown();
        }
    }

    /**
     * Generate a presigned URL for downloading (GET method).
     */
    public URL generatePresignedDownloadUrl(String objectKey, int expirationMinutes) {
        ClientBuilderConfiguration clientBuilderConfiguration = new ClientBuilderConfiguration();
        clientBuilderConfiguration.setSignatureVersion(SignVersion.V4);

        OSS ossClient = new OSSClientBuilder().build(endpoint, accessKeyId, accessKeySecret);

        try {
            Date expiration = new Date(System.currentTimeMillis() + expirationMinutes * 60 * 1000);
            GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(bucketName, objectKey,
                    HttpMethod.GET);
            request.setExpiration(expiration);

            URL signedUrl = ossClient.generatePresignedUrl(request);
            logger.info("Generated Presigned Download URL: " + signedUrl);
            return signedUrl;
        } catch (Exception e) {
            logger.severe("Error generating presigned download URL: " + e.getMessage());
            throw new RuntimeException("Error generating presigned URL: " + e.getMessage(), e);
        } finally {
            ossClient.shutdown();
        }
    }

    public List<String> listAllObjects(String fileType) {
        OSS ossClient = new OSSClientBuilder().build(endpoint, accessKeyId, accessKeySecret);
        List<String> pictureUrls = new ArrayList<>();

        try {
            String folderPath = getFolderPath(fileType);
            ObjectListing objectListing = ossClient.listObjects(bucketName, folderPath);
            for (OSSObjectSummary objectSummary : objectListing.getObjectSummaries()) {
                String objectKey = objectSummary.getKey();
                if (!objectKey.equals(folderPath)) {
                    // Generate a pre-signed URL for each object
                    URL signedUrl = generatePresignedDownloadUrl(objectKey, 60); // 60 minutes expiry
                    pictureUrls.add(signedUrl.toString());
                }
            }
            logger.info("Listed " + pictureUrls.size() + " pictures from folder: " + folderPath);
        } catch (Exception e) {
            logger.severe("Error listing objects: " + e.getMessage());
            throw new RuntimeException("Error listing objects", e);
        } finally {
            ossClient.shutdown();
        }
        return pictureUrls;
    }

    public void deleteObject(String objectKey) {
        OSS ossClient = new OSSClientBuilder().build(endpoint, accessKeyId, accessKeySecret);
        try {
            ossClient.deleteObject(bucketName, objectKey);
            logger.info("Deleted object: " + objectKey);
        } catch (Exception e) {
            logger.severe("Error deleting object: " + e.getMessage());
            throw new RuntimeException("Error deleting object", e);
        } finally {
            ossClient.shutdown();
        }
    }
}
