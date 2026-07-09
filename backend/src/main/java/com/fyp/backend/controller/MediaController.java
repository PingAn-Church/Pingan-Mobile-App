package com.fyp.backend.controller;

import java.io.IOException;
import java.io.InputStream;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.ResponseEntity.BodyBuilder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import com.aliyun.oss.OSSErrorCode;
import com.aliyun.oss.OSSException;
import com.aliyun.oss.model.OSSObject;
import com.aliyun.oss.model.ObjectMetadata;
import com.fyp.backend.service.MediaTokenService;
import com.fyp.backend.service.OSSService;

/**
 * Media gateway: streams private-bucket OSS objects to clients so the bucket never
 * needs public read access and server↔OSS bytes ride the free internal endpoint.
 * Authorization is the HMAC-signed query minted by {@link MediaTokenService} — media
 * loaders (RN Image, expo-av, web img tags) can't send JWT headers, which is also why
 * /media/** is permitAll in the security config.
 *
 * Supports what direct OSS access gave clients: byte-range resume (206), ETag
 * revalidation (304), and mid-transfer aborts (closing the client connection closes
 * the upstream OSS stream).
 */
@RestController
public class MediaController {

    /** Keys never change content (updates upload new keys), so a day of caching is safe. */
    private static final String CACHE_CONTROL = "private, max-age=86400";

    /** Single-range forms only ("bytes=a-b", "bytes=a-"); anything else gets the full object. */
    private static final Pattern RANGE = Pattern.compile("^bytes=(\\d+)-(\\d*)$");

    private static final Logger logger = Logger.getLogger(MediaController.class.getName());

    private final OSSService ossService;
    private final MediaTokenService mediaTokenService;

    public MediaController(OSSService ossService, MediaTokenService mediaTokenService) {
        this.ossService = ossService;
        this.mediaTokenService = mediaTokenService;
    }

    @GetMapping("/media/{*objectKey}")
    public ResponseEntity<StreamingResponseBody> serve(
            @PathVariable String objectKey,
            @RequestParam(name = "e", required = false) String expiresAt,
            @RequestParam(name = "s", required = false) String signature,
            @RequestHeader(name = HttpHeaders.RANGE, required = false) String rangeHeader,
            @RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {

        String key = objectKey.startsWith("/") ? objectKey.substring(1) : objectKey;

        if (!mediaTokenService.verify(key, expiresAt, signature)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        // Unmanaged folders and traversal-looking keys answer like missing objects.
        if (!OSSService.isManagedKey(key) || key.contains("..")) {
            return ResponseEntity.notFound().build();
        }

        Long rangeStart = null;
        Long rangeEnd = null;
        if (rangeHeader != null) {
            Matcher matcher = RANGE.matcher(rangeHeader.trim());
            if (matcher.matches()) {
                rangeStart = Long.parseLong(matcher.group(1));
                rangeEnd = matcher.group(2).isEmpty() ? null : Long.parseLong(matcher.group(2));
            }
        }

        String noneMatchEtag = normalizeEtag(ifNoneMatch);

        OSSObject object;
        try {
            object = ossService.getObject(key, rangeStart, rangeEnd, noneMatchEtag);
        } catch (OSSException e) {
            if (OSSErrorCode.NO_SUCH_KEY.equals(e.getErrorCode())) {
                return ResponseEntity.notFound().build();
            }
            if ("InvalidRange".equals(e.getErrorCode())) {
                return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).build();
            }
            logger.severe("OSS error serving media " + key + ": " + e.getErrorCode() + " - " + e.getErrorMessage());
            return ResponseEntity.internalServerError().build();
        }

        if (object == null) {
            // The If-None-Match constraint matched: client's copy is current, no bytes moved.
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                    .header(HttpHeaders.CACHE_CONTROL, CACHE_CONTROL)
                    .eTag(noneMatchEtag)
                    .build();
        }

        ObjectMetadata metadata = object.getObjectMetadata();
        String contentRange = (String) metadata.getRawMetadata().get(HttpHeaders.CONTENT_RANGE);

        BodyBuilder response = ResponseEntity
                .status(contentRange != null ? HttpStatus.PARTIAL_CONTENT : HttpStatus.OK)
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .header(HttpHeaders.CACHE_CONTROL, CACHE_CONTROL)
                .header("X-Content-Type-Options", "nosniff")
                .contentLength(metadata.getContentLength())
                .contentType(safeMediaType(metadata.getContentType()));
        if (metadata.getETag() != null) {
            response.eTag('"' + metadata.getETag() + '"');
        }
        if (contentRange != null) {
            response.header(HttpHeaders.CONTENT_RANGE, contentRange);
        }

        StreamingResponseBody body = outputStream -> {
            // try-with-resources releases the OSS connection on completion AND on client
            // abort ("stop mid-air") — the abort's IOException is expected, not an error.
            try (OSSObject toClose = object; InputStream in = toClose.getObjectContent()) {
                in.transferTo(outputStream);
            } catch (IOException e) {
                logger.fine("Media stream for " + key + " ended early: " + e.getMessage());
            }
        };
        return response.body(body);
    }

    /** Strip the weak-validator prefix; keep RFC quoting so OSS compares entity tags exactly. */
    private static String normalizeEtag(String value) {
        if (value == null) {
            return null;
        }
        String etag = value.trim();
        if (etag.startsWith("W/")) {
            etag = etag.substring(2);
        }
        return etag.isEmpty() ? null : etag;
    }

    private static MediaType safeMediaType(String contentType) {
        try {
            return MediaType.parseMediaType(contentType);
        } catch (Exception e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
