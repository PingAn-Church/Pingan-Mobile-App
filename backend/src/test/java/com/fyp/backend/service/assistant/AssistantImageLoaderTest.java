package com.fyp.backend.service.assistant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.aliyun.oss.OSSException;
import com.aliyun.oss.model.OSSObject;
import com.aliyun.oss.model.ObjectMetadata;
import com.fyp.backend.config.app.AssistantProperties;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.service.OSSService;

/**
 * The loader is the only thing standing between a stored URL and the provider.
 * It must fetch exactly the conversation's own photos, inline them without the
 * URL, and turn every failure into "no photo" rather than "no answer".
 */
@ExtendWith(MockitoExtension.class)
class AssistantImageLoaderTest {

    private static final long CONVERSATION = 77L;
    private static final byte[] PIXELS = "not-really-a-jpeg".getBytes(StandardCharsets.UTF_8);

    @Mock private OSSService ossService;

    private AssistantProperties properties;
    private AssistantImageLoader loader;

    @BeforeEach
    void setUp() {
        properties = new AssistantProperties();
        loader = new AssistantImageLoader(ossService, properties);
    }

    private static Message photo(String content) {
        GroupConversation group = new GroupConversation();
        group.setId(CONVERSATION);
        Message message = new Message();
        message.setId(5L);
        message.setType("image");
        message.setContent(content);
        message.setConversation(group);
        return message;
    }

    private static OSSObject object(byte[] bytes, String contentType) {
        OSSObject object = new OSSObject();
        object.setObjectContent(new ByteArrayInputStream(bytes));
        ObjectMetadata metadata = new ObjectMetadata();
        metadata.setContentLength(bytes.length);
        if (contentType != null) {
            metadata.setContentType(contentType);
        }
        object.setObjectMetadata(metadata);
        return object;
    }

    @Test
    void aStoredUrlBecomesAnInlineDataUrlWithNoTraceOfTheBucket() {
        String key = "conversations/" + CONVERSATION + "/abc.jpg";
        when(ossService.getObject(eq(key), any(), any(), any())).thenReturn(object(PIXELS, "image/jpeg"));

        Optional<String> url = loader.dataUrl(photo("https://bucket.oss-cn.aliyuncs.com/" + key));

        assertEquals("data:image/jpeg;base64," + Base64.getEncoder().encodeToString(PIXELS), url.orElseThrow());
        assertTrue(!url.get().contains("aliyuncs"));
    }

    /** Older rows hold the bare key rather than a URL; both must resolve. */
    @Test
    void aBareObjectKeyResolvesToo() {
        String key = "conversations/" + CONVERSATION + "/abc.png";
        when(ossService.getObject(eq(key), any(), any(), any())).thenReturn(object(PIXELS, "image/png"));

        assertTrue(loader.dataUrl(photo(key)).orElseThrow().startsWith("data:image/png;base64,"));
    }

    /**
     * The content is client-supplied. A row that names another conversation's
     * photo — or a profile picture, or an external link — is never fetched: the
     * assistant must not be the thing that carries it into this group.
     */
    @Test
    void aPhotoOutsideThisConversationsFolderIsRefusedWithoutFetching() {
        assertTrue(loader.dataUrl(photo("https://bucket.example/conversations/78/abc.jpg")).isEmpty());
        assertTrue(loader.dataUrl(photo("https://bucket.example/userProfilePictures/x.jpg")).isEmpty());
        assertTrue(loader.dataUrl(photo("https://elsewhere.example/abc.jpg")).isEmpty());
        assertTrue(loader.dataUrl(photo(null)).isEmpty());
        verify(ossService, never()).getObject(anyString(), any(), any(), any());
    }

    @Test
    void aPhotoOverTheByteCapIsSkipped() {
        properties.setMaxImageBytes(PIXELS.length - 1);
        String key = "conversations/" + CONVERSATION + "/big.jpg";
        when(ossService.getObject(eq(key), any(), any(), any())).thenReturn(object(PIXELS, "image/jpeg"));

        assertTrue(loader.dataUrl(photo(key)).isEmpty());
    }

    /** The declared length is advisory; the bytes themselves are what is capped. */
    @Test
    void aPhotoWhoseDeclaredLengthLiesIsStillCapped() {
        properties.setMaxImageBytes(PIXELS.length - 1);
        String key = "conversations/" + CONVERSATION + "/liar.jpg";
        OSSObject object = object(PIXELS, "image/jpeg");
        object.getObjectMetadata().setContentLength(1);
        when(ossService.getObject(eq(key), any(), any(), any())).thenReturn(object);

        assertTrue(loader.dataUrl(photo(key)).isEmpty());
    }

    /** A bare PUT can leave OSS's default type on the object; the extension decides then. */
    @Test
    void anOctetStreamObjectIsTypedByItsExtension() {
        String key = "conversations/" + CONVERSATION + "/abc.webp";
        when(ossService.getObject(eq(key), any(), any(), any()))
                .thenReturn(object(PIXELS, "application/octet-stream"));

        assertTrue(loader.dataUrl(photo(key)).orElseThrow().startsWith("data:image/webp;base64,"));
    }

    @Test
    void somethingThatIsNotAnImageIsSkipped() {
        String key = "conversations/" + CONVERSATION + "/notes.pdf";
        when(ossService.getObject(eq(key), any(), any(), any()))
                .thenReturn(object(PIXELS, "application/pdf"));

        assertTrue(loader.dataUrl(photo(key)).isEmpty());
    }

    /** A deleted object is an OSSException from the SDK; it must not escape. */
    @Test
    void aMissingObjectIsNoPhotoNotAnException() {
        String key = "conversations/" + CONVERSATION + "/gone.jpg";
        when(ossService.getObject(eq(key), any(), any(), any()))
                .thenThrow(new OSSException("The specified key does not exist.", "NoSuchKey",
                        "req", "host", "", "", ""));

        assertTrue(loader.dataUrl(photo(key)).isEmpty());
    }

    /** Voice rows carry a metadata suffix; a photo row that grows one must still resolve. */
    @Test
    void aMetadataSuffixIsIgnored() {
        String key = "conversations/" + CONVERSATION + "/abc.jpg";
        when(ossService.getObject(eq(key), any(), any(), any())).thenReturn(object(PIXELS, "image/jpeg"));

        assertTrue(loader.dataUrl(photo("https://bucket.example/" + key + "|1080x1920")).isPresent());
    }
}
