package com.fyp.backend.service.assistant;

import java.io.IOException;
import java.io.InputStream;
import java.util.Base64;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.aliyun.oss.model.OSSObject;
import com.fyp.backend.config.app.AssistantProperties;
import com.fyp.backend.model.Message;
import com.fyp.backend.service.OSSService;

import lombok.RequiredArgsConstructor;

/**
 * Turns a photo somebody posted in the chat into something the model can look at.
 *
 * The stored value is a storage URL, which is useless to a model and must not be
 * sent to one: the bucket is private, and the URL names the storage layout. So the
 * server fetches the bytes itself and inlines them as a {@code data:} URL. The
 * provider receives pixels and a media type, nothing about where they live.
 *
 * Every failure — a key outside this conversation, an object gone from OSS, a
 * photo over the size cap, a type that is not an image — degrades to
 * {@link Optional#empty()} and a log line, and the caller falls back to the
 * "[photo]" placeholder the model always got. A photo that cannot be shown must
 * not cost the group its answer.
 */
@Component
@RequiredArgsConstructor
public class AssistantImageLoader {

    private static final Logger log = LoggerFactory.getLogger(AssistantImageLoader.class);

    /** What the chat upload endpoint admits, and what vision models accept. */
    static final Set<String> IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/gif", "image/webp");

    private final OSSService ossService;
    private final AssistantProperties properties;

    /**
     * A {@code data:<type>;base64,...} URL for the photo in this message.
     *
     * Only objects under this conversation's own folder are read. The content is
     * client-supplied at send time, and while the gateway checks that it points at
     * a managed folder, nothing stops a client naming another conversation's
     * photo; the assistant must not be the thing that leaks it into this group.
     */
    public Optional<String> dataUrl(Message message) {
        if (message == null || message.getConversation() == null) {
            return Optional.empty();
        }
        String key = OSSService.managedObjectKey(mediaReference(message.getContent()));
        String ownFolder = "conversations/" + message.getConversation().getId() + "/";
        if (key == null || !key.startsWith(ownFolder)) {
            log.warn("Photo in message {} is not stored under its own conversation; not showing it.",
                    message.getId());
            return Optional.empty();
        }

        try (OSSObject object = ossService.getObject(key, null, null, null)) {
            if (object == null) {
                return Optional.empty();
            }
            long declared = object.getObjectMetadata() == null
                    ? -1 : object.getObjectMetadata().getContentLength();
            if (declared > properties.getMaxImageBytes()) {
                log.info("Photo in message {} is {} bytes, over the {}-byte cap; not showing it.",
                        message.getId(), declared, properties.getMaxImageBytes());
                return Optional.empty();
            }
            String type = mediaType(object, key);
            if (type == null) {
                log.info("Photo in message {} has an unsupported media type; not showing it.",
                        message.getId());
                return Optional.empty();
            }
            byte[] bytes = readCapped(object.getObjectContent(), properties.getMaxImageBytes());
            if (bytes == null) {
                log.info("Photo in message {} exceeded the {}-byte cap while reading; not showing it.",
                        message.getId(), properties.getMaxImageBytes());
                return Optional.empty();
            }
            return Optional.of("data:" + type + ";base64," + Base64.getEncoder().encodeToString(bytes));
        } catch (Exception e) {
            // Includes OSSException for a deleted object and IOException mid-read.
            log.warn("Could not load the photo in message {}: {}", message.getId(), e.toString());
            return Optional.empty();
        }
    }

    /** Voice rows store {@code url|durationSeconds}; photos may grow a suffix the same way. */
    private static String mediaReference(String content) {
        if (content == null) {
            return null;
        }
        int separator = content.indexOf('|');
        return separator >= 0 ? content.substring(0, separator) : content;
    }

    /**
     * The image type to declare, or null if this is not an image we will send.
     *
     * The stored Content-Type is authoritative when it is an image type. Uploads
     * are presigned with the type the client asked for, but a bare PUT can leave
     * OSS's default {@code application/octet-stream}, so the file extension is the
     * fallback rather than a reason to refuse.
     */
    private static String mediaType(OSSObject object, String key) {
        String stored = object.getObjectMetadata() == null
                ? null : object.getObjectMetadata().getContentType();
        if (stored != null) {
            String bare = stored.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
            if (IMAGE_TYPES.contains(bare)) {
                return bare;
            }
        }
        String lower = key.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (lower.endsWith(".png")) {
            return "image/png";
        }
        if (lower.endsWith(".gif")) {
            return "image/gif";
        }
        if (lower.endsWith(".webp")) {
            return "image/webp";
        }
        return null;
    }

    /** Reads the whole stream, or returns null once it has gone past {@code cap} bytes. */
    private static byte[] readCapped(InputStream in, long cap) throws IOException {
        if (in == null) {
            return null;
        }
        // One byte over the cap is enough to know it does not fit; the declared
        // length is advisory, so the cap is enforced on the bytes themselves.
        byte[] bytes = in.readNBytes((int) Math.min(Integer.MAX_VALUE - 8, cap + 1));
        return bytes.length > cap ? null : bytes;
    }
}
