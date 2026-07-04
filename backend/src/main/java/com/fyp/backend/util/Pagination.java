package com.fyp.backend.util;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.data.domain.Page;

/**
 * Central guardrails for list pagination so no endpoint can be coerced into
 * returning an unbounded payload. Page sizes are clamped to a sane maximum and
 * page indexes are floored at zero.
 */
public final class Pagination {

    /** Default page size when a client omits one. */
    public static final int DEFAULT_SIZE = 20;

    /** Hard upper bound on any list page size. */
    public static final int MAX_SIZE = 50;

    private Pagination() {
    }

    public static int clampSize(int size) {
        return clampSize(size, MAX_SIZE);
    }

    public static int clampSize(int size, int max) {
        if (size < 1) {
            return DEFAULT_SIZE <= max ? DEFAULT_SIZE : max;
        }
        return Math.min(size, max);
    }

    public static int clampPage(int page) {
        return Math.max(page, 0);
    }

    public static Map<String, Object> pageMetadata(Page<?> page) {
        Map<String, Object> pagination = new LinkedHashMap<>();
        pagination.put("page", page.getNumber());
        pagination.put("size", page.getSize());
        pagination.put("totalCount", page.getTotalElements());
        pagination.put("hasMore", page.hasNext());
        return pagination;
    }

    public static Map<String, Object> envelope(Object data, Page<?> page) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("data", data);
        body.put("pagination", pageMetadata(page));
        return body;
    }
}
