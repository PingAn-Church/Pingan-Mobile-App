package com.fyp.backend.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.aliyun.oss.OSSException;
import com.aliyun.oss.internal.OSSHeaders;
import com.aliyun.oss.model.OSSObject;
import com.aliyun.oss.model.ObjectMetadata;
import com.fyp.backend.config.security.JwtAuthenticationFilter;
import com.fyp.backend.config.security.SpringSecurityConfig;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.service.MediaTokenService;
import com.fyp.backend.service.OSSService;
import com.fyp.backend.util.JwtUtil;

/**
 * Web-layer tests for the /media gateway: real security config + real token service
 * (so signatures are verified end-to-end), OSS fully mocked. Every request here is
 * anonymous — passing tests double as proof of the permitAll(/media/**) rule.
 */
@WebMvcTest(controllers = MediaController.class)
@Import({ SpringSecurityConfig.class, JwtAuthenticationFilter.class, MediaTokenService.class })
@TestPropertySource(properties = { "IP_ADDR=127.0.0.1" })
class MediaControllerTest {

    private static final String KEY = "eventPictures/pic.jpg";

    @Autowired private MockMvc mockMvc;
    @Autowired private MediaTokenService mediaTokenService;

    @MockBean private OSSService ossService;
    @MockBean private JwtUtil jwtUtil;
    @MockBean private UserRepository userRepository;

    private String signedUrl(String objectKey) {
        return "/media/" + objectKey + "?" + mediaTokenService.mintQuery(objectKey);
    }

    private static OSSObject ossObject(byte[] content, String contentRange) {
        OSSObject object = new OSSObject();
        object.setObjectContent(new ByteArrayInputStream(content));
        ObjectMetadata metadata = new ObjectMetadata();
        metadata.setContentType("image/jpeg");
        metadata.setContentLength(content.length);
        metadata.setHeader(OSSHeaders.ETAG, "etag123");
        if (contentRange != null) {
            metadata.setHeader(HttpHeaders.CONTENT_RANGE, contentRange);
        }
        object.setObjectMetadata(metadata);
        return object;
    }

    private static OSSException ossError(String errorCode) {
        return new OSSException("simulated " + errorCode, errorCode, "request-id", "host-id", null, null, null);
    }

    // ---- happy path: full object ------------------------------------------

    @Test
    void streamsFullObjectWithCachingHeaders() throws Exception {
        byte[] bytes = "full-image-bytes".getBytes(StandardCharsets.UTF_8);
        when(ossService.getObject(eq(KEY), isNull(), isNull(), isNull()))
                .thenReturn(ossObject(bytes, null));

        MvcResult pending = mockMvc.perform(get(signedUrl(KEY)))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(pending))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/jpeg"))
                .andExpect(header().longValue(HttpHeaders.CONTENT_LENGTH, bytes.length))
                .andExpect(header().string(HttpHeaders.ETAG, "\"etag123\""))
                .andExpect(header().string(HttpHeaders.ACCEPT_RANGES, "bytes"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "private, max-age=86400"))
                .andExpect(content().bytes(bytes));
    }

    // ---- range requests (resume from break point) --------------------------

    @Test
    void servesByteRangeAsPartialContent() throws Exception {
        byte[] slice = "part".getBytes(StandardCharsets.UTF_8);
        when(ossService.getObject(eq(KEY), eq(0L), eq(3L), isNull()))
                .thenReturn(ossObject(slice, "bytes 0-3/16"));

        MvcResult pending = mockMvc.perform(get(signedUrl(KEY)).header(HttpHeaders.RANGE, "bytes=0-3"))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(pending))
                .andExpect(status().isPartialContent())
                .andExpect(header().string(HttpHeaders.CONTENT_RANGE, "bytes 0-3/16"))
                .andExpect(content().bytes(slice));
    }

    @Test
    void forwardsOpenEndedRange() throws Exception {
        byte[] slice = "tail-bytes".getBytes(StandardCharsets.UTF_8);
        when(ossService.getObject(eq(KEY), eq(6L), isNull(), isNull()))
                .thenReturn(ossObject(slice, "bytes 6-15/16"));

        MvcResult pending = mockMvc.perform(get(signedUrl(KEY)).header(HttpHeaders.RANGE, "bytes=6-"))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(pending)).andExpect(status().isPartialContent());
    }

    @Test
    void malformedRangeServesFullObject() throws Exception {
        byte[] bytes = "whole".getBytes(StandardCharsets.UTF_8);
        when(ossService.getObject(eq(KEY), isNull(), isNull(), isNull()))
                .thenReturn(ossObject(bytes, null));

        MvcResult pending = mockMvc.perform(get(signedUrl(KEY)).header(HttpHeaders.RANGE, "bytes=abc"))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(pending))
                .andExpect(status().isOk())
                .andExpect(content().bytes(bytes));
    }

    @Test
    void unsatisfiableRangeMapsTo416() throws Exception {
        when(ossService.getObject(eq(KEY), eq(999999L), isNull(), isNull()))
                .thenThrow(ossError("InvalidRange"));

        mockMvc.perform(get(signedUrl(KEY)).header(HttpHeaders.RANGE, "bytes=999999-"))
                .andExpect(status().isRequestedRangeNotSatisfiable());
    }

    // ---- revalidation -------------------------------------------------------

    @Test
    void etagMatchReturns304WithoutBody() throws Exception {
        when(ossService.getObject(eq(KEY), isNull(), isNull(), eq("\"etag123\"")))
                .thenReturn(null);

        mockMvc.perform(get(signedUrl(KEY)).header(HttpHeaders.IF_NONE_MATCH, "\"etag123\""))
                .andExpect(status().isNotModified())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "private, max-age=86400"))
                .andExpect(content().bytes(new byte[0]));

        verify(ossService).getObject(eq(KEY), isNull(), isNull(), eq("\"etag123\""));
    }

    // ---- authorization: the signature is the auth ---------------------------

    @Test
    void expiredTokenIsForbidden() throws Exception {
        String expiredQuery = mediaTokenService.mintQuery(KEY, -10);
        mockMvc.perform(get("/media/" + KEY + "?" + expiredQuery))
                .andExpect(status().isForbidden());
        verifyNoInteractions(ossService);
    }

    @Test
    void tamperedSignatureIsForbidden() throws Exception {
        String url = signedUrl(KEY) + "x"; // corrupt the signature's last character
        mockMvc.perform(get(url)).andExpect(status().isForbidden());
        verifyNoInteractions(ossService);
    }

    @Test
    void missingTokenIsForbidden() throws Exception {
        mockMvc.perform(get("/media/" + KEY)).andExpect(status().isForbidden());
        verifyNoInteractions(ossService);
    }

    @Test
    void tokenForOneKeyDoesNotServeAnother() throws Exception {
        String query = mediaTokenService.mintQuery("eventPictures/other.jpg");
        mockMvc.perform(get("/media/" + KEY + "?" + query))
                .andExpect(status().isForbidden());
        verifyNoInteractions(ossService);
    }

    // ---- object-key guardrails ----------------------------------------------

    @Test
    void unmanagedPrefixIsNotFound() throws Exception {
        String key = "internalBackups/dump.sql";
        mockMvc.perform(get(signedUrl(key))).andExpect(status().isNotFound());
        verifyNoInteractions(ossService);
    }

    @Test
    void missingObjectIsNotFound() throws Exception {
        when(ossService.getObject(eq(KEY), any(), any(), any()))
                .thenThrow(ossError("NoSuchKey"));

        mockMvc.perform(get(signedUrl(KEY))).andExpect(status().isNotFound());
    }
}
