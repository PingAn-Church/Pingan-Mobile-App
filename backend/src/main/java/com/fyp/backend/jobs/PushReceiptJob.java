package com.fyp.backend.jobs;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.repository.PushTokenRepository;
import com.fyp.backend.service.RedisService;

/**
 * Follows up on Expo push tickets. A ticket Expo accepted can still fail at the
 * transport layer afterwards; that failure — most importantly DeviceNotRegistered
 * for uninstalled apps — often only appears in the push *receipt*. Expo's policy
 * is that senders who keep pushing to dead tokens risk being throttled, so this
 * job retires them.
 *
 * State is the Redis list PushNotificationService feeds via
 * {@link RedisService#enqueuePushReceipt}; entries are "ticketId|epochMillis|token".
 * Receipts younger than 15 minutes are re-queued untouched (Expo asks for that
 * settling time); entries older than 24 hours are dropped — their receipts have
 * expired server-side. Everything is best-effort: a failed run re-queues and the
 * next run retries.
 */
@Component
public class PushReceiptJob {

    private static final Logger log = LoggerFactory.getLogger(PushReceiptJob.class);

    static final String EXPO_RECEIPT_URL = "https://exp.host/--/api/v2/push/getReceipts";
    private static final int MAX_PER_RUN = 1000;
    private static final long MIN_AGE_MS = 15 * 60_000L;
    private static final long MAX_AGE_MS = 24 * 60 * 60_000L;
    /** Expo caps getReceipts requests at 1000 ids; stay well under it per call. */
    private static final int REQUEST_CHUNK = 300;

    @Autowired private RedisService redisService;
    @Autowired private PushTokenRepository pushTokenRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();
    // Non-final so a test can swap in a mock, mirroring PushNotificationService.
    private RestTemplate restTemplate = buildRestTemplate();

    private static RestTemplate buildRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(10_000);
        return new RestTemplate(factory);
    }

    @Scheduled(fixedDelay = 15 * 60_000L, initialDelay = 5 * 60_000L)
    public void checkPushReceipts() {
        List<String> entries;
        try {
            entries = redisService.drainPushReceipts(MAX_PER_RUN);
        } catch (Exception redisDown) {
            return; // nothing drained, nothing lost — next run retries
        }
        if (entries.isEmpty()) return;

        long now = System.currentTimeMillis();
        Map<String, String> tokenByTicket = new HashMap<>();
        // Original enqueue timestamps, preserved verbatim on every requeue so the
        // 24h drop cap counts from the first send, not from the latest retry.
        Map<String, Long> enqueuedAtByTicket = new HashMap<>();
        for (String entry : entries) {
            String[] parts = entry.split("\\|", 3);
            if (parts.length != 3) continue; // malformed — drop
            long enqueuedAt;
            try {
                enqueuedAt = Long.parseLong(parts[1]);
            } catch (NumberFormatException e) {
                continue;
            }
            if (now - enqueuedAt > MAX_AGE_MS) continue; // receipt expired at Expo — drop
            if (now - enqueuedAt < MIN_AGE_MS) {
                redisService.requeuePushReceipt(entry); // too fresh — ask again later
                continue;
            }
            tokenByTicket.put(parts[0], parts[2]);
            enqueuedAtByTicket.put(parts[0], enqueuedAt);
        }
        if (tokenByTicket.isEmpty()) return;

        List<String> ids = new ArrayList<>(tokenByTicket.keySet());
        int retired = 0;
        for (int from = 0; from < ids.size(); from += REQUEST_CHUNK) {
            List<String> chunk = ids.subList(from, Math.min(from + REQUEST_CHUNK, ids.size()));
            retired += fetchAndProcess(chunk, tokenByTicket, enqueuedAtByTicket);
        }
        if (retired > 0) {
            log.info("Retired {} dead push token(s) from Expo receipts", retired);
        }
    }

    private int fetchAndProcess(List<String> ticketIds, Map<String, String> tokenByTicket,
            Map<String, Long> enqueuedAtByTicket) {
        JsonNode receipts;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            String response = restTemplate.postForObject(EXPO_RECEIPT_URL,
                    new HttpEntity<>(Map.of("ids", ticketIds), headers), String.class);
            receipts = objectMapper.readTree(response == null ? "{}" : response).path("data");
        } catch (Exception e) {
            // Whole chunk unresolved — put it back for the next run.
            for (String id : ticketIds) {
                requeue(id, tokenByTicket, enqueuedAtByTicket);
            }
            log.warn("Could not fetch Expo push receipts: {}", e.getMessage());
            return 0;
        }

        int retired = 0;
        for (String id : ticketIds) {
            JsonNode receipt = receipts.path(id);
            if (receipt.isMissingNode()) {
                requeue(id, tokenByTicket, enqueuedAtByTicket); // not settled yet
                continue;
            }
            if ("ok".equals(receipt.path("status").asText())) continue;
            String errorCode = receipt.path("details").path("error").asText();
            if ("DeviceNotRegistered".equals(errorCode)) {
                try {
                    retired += pushTokenRepository.deactivateByToken(tokenByTicket.get(id));
                } catch (Exception e) {
                    log.warn("Could not deactivate dead push token: {}", e.getMessage());
                }
            } else {
                log.warn("Expo receipt error ({}): {}", errorCode, receipt.path("message").asText());
            }
        }
        return retired;
    }

    private void requeue(String ticketId, Map<String, String> tokenByTicket,
            Map<String, Long> enqueuedAtByTicket) {
        redisService.requeuePushReceipt(
                ticketId + "|" + enqueuedAtByTicket.get(ticketId) + "|" + tokenByTicket.get(ticketId));
    }
}
