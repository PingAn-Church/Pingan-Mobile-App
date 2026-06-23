package com.fyp.backend.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/** Guards the central list page-size clamps so no endpoint can return an unbounded page. */
class PaginationTest {

    @Test
    void clampSizeBoundsToMaxAndDefaultsWhenNonPositive() {
        assertEquals(10, Pagination.clampSize(10));
        assertEquals(Pagination.MAX_SIZE, Pagination.clampSize(9999));
        assertEquals(Pagination.MAX_SIZE, Pagination.clampSize(Pagination.MAX_SIZE));
        assertEquals(Pagination.DEFAULT_SIZE, Pagination.clampSize(0));
        assertEquals(Pagination.DEFAULT_SIZE, Pagination.clampSize(-5));
    }

    @Test
    void clampSizeRespectsACustomMax() {
        assertEquals(100, Pagination.clampSize(200, 100));
        assertEquals(50, Pagination.clampSize(50, 100));
        // Non-positive falls back to DEFAULT_SIZE when it fits under max, else to max.
        assertEquals(Pagination.DEFAULT_SIZE, Pagination.clampSize(0, 100));
        assertEquals(5, Pagination.clampSize(0, 5));
        assertEquals(5, Pagination.clampSize(10, 5));
    }

    @Test
    void clampPageFloorsAtZero() {
        assertEquals(0, Pagination.clampPage(-1));
        assertEquals(0, Pagination.clampPage(0));
        assertEquals(3, Pagination.clampPage(3));
    }
}
