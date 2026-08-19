package com.fyp.backend.config.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class DatabaseIntegrityMigrationTest {

    @Test
    void duplicateAppGroupsFailWithTheirIds() {
        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> DatabaseIntegrityMigration.requireSingleAppGroup(List.of(4L, 9L)));

        assertTrue(error.getMessage().contains("[4, 9]"));
    }

    @Test
    void h2IsNotMistakenForPostgres() {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:integrity-platform");

        assertFalse(DatabaseIntegrityMigration.isPostgres(dataSource));
    }

    /**
     * The duplicate-pair merge, run against a minimal schema: two conversations
     * between the same two users (stored in opposite column order), with messages,
     * divergent read watermarks and overlapping mutes. Everything must collapse
     * onto the OLDEST conversation without losing history or read positions.
     */
    @Test
    void mergesDuplicatePrivateConversationsIntoTheOldest() {
        JdbcDataSource dataSource = new JdbcDataSource();
        // A named in-memory database, dropped when the last connection closes after
        // the test; DB_CLOSE_DELAY=-1 keeps it alive between JdbcTemplate calls.
        dataSource.setURL("jdbc:h2:mem:pair-merge;DB_CLOSE_DELAY=-1");
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        jdbc.execute("CREATE TABLE private_conversations (id BIGINT PRIMARY KEY, "
                + "user_one_id BIGINT NOT NULL, user_two_id BIGINT NOT NULL, updated_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE messages (id BIGINT PRIMARY KEY, conversation_id BIGINT NOT NULL)");
        jdbc.execute("CREATE TABLE conversation_read_state (id BIGINT PRIMARY KEY, "
                + "conversation_id BIGINT NOT NULL, user_id BIGINT NOT NULL, "
                + "last_read_message_id BIGINT, UNIQUE (conversation_id, user_id))");
        jdbc.execute("CREATE TABLE conversation_mutes (id BIGINT PRIMARY KEY, "
                + "user_id BIGINT NOT NULL, conversation_id BIGINT NOT NULL, "
                + "conversation_type VARCHAR(16) NOT NULL, "
                + "UNIQUE (user_id, conversation_id, conversation_type))");

        // Conversation 10 (older, kept) and 20 (duplicate, opposite column order).
        jdbc.update("INSERT INTO private_conversations VALUES (10, 1, 2, TIMESTAMP '2024-01-01 00:00:00')");
        jdbc.update("INSERT INTO private_conversations VALUES (20, 2, 1, TIMESTAMP '2025-06-01 00:00:00')");
        // A third, non-duplicate conversation must be untouched.
        jdbc.update("INSERT INTO private_conversations VALUES (30, 1, 3, TIMESTAMP '2024-05-01 00:00:00')");

        jdbc.update("INSERT INTO messages VALUES (100, 10)");
        jdbc.update("INSERT INTO messages VALUES (200, 20)");
        jdbc.update("INSERT INTO messages VALUES (300, 30)");

        // User 1: rows on both sides, duplicate side further along -> keeper takes MAX.
        jdbc.update("INSERT INTO conversation_read_state VALUES (1, 10, 1, 100)");
        jdbc.update("INSERT INTO conversation_read_state VALUES (2, 20, 1, 200)");
        // User 2: row only on the duplicate -> moved across.
        jdbc.update("INSERT INTO conversation_read_state VALUES (3, 20, 2, 200)");

        // User 1 muted both (overlap -> duplicate's row dropped); user 2 only the duplicate (moved).
        jdbc.update("INSERT INTO conversation_mutes VALUES (1, 1, 10, 'private')");
        jdbc.update("INSERT INTO conversation_mutes VALUES (2, 1, 20, 'private')");
        jdbc.update("INSERT INTO conversation_mutes VALUES (3, 2, 20, 'private')");

        new DatabaseIntegrityMigration().mergeDuplicatePrivateConversations(jdbc);

        // Duplicate gone, keeper + unrelated conversation remain.
        assertEquals(List.of(10L, 30L), jdbc.queryForList(
                "SELECT id FROM private_conversations ORDER BY id", Long.class));
        // All pair messages now on the keeper; the unrelated conversation untouched.
        assertEquals(List.of(100L, 200L), jdbc.queryForList(
                "SELECT id FROM messages WHERE conversation_id = 10 ORDER BY id", Long.class));
        assertEquals(List.of(300L), jdbc.queryForList(
                "SELECT id FROM messages WHERE conversation_id = 30", Long.class));
        // Watermarks: user 1 advanced to the duplicate's further position, user 2 moved across.
        assertEquals(200L, jdbc.queryForObject(
                "SELECT last_read_message_id FROM conversation_read_state "
                + "WHERE conversation_id = 10 AND user_id = 1", Long.class));
        assertEquals(200L, jdbc.queryForObject(
                "SELECT last_read_message_id FROM conversation_read_state "
                + "WHERE conversation_id = 10 AND user_id = 2", Long.class));
        assertEquals(0L, (long) jdbc.queryForObject(
                "SELECT COUNT(*) FROM conversation_read_state WHERE conversation_id = 20", Long.class));
        // Mutes: one row per user on the keeper, none on the duplicate.
        assertEquals(List.of(1L, 2L), jdbc.queryForList(
                "SELECT user_id FROM conversation_mutes WHERE conversation_id = 10 ORDER BY user_id",
                Long.class));
        assertEquals(0L, (long) jdbc.queryForObject(
                "SELECT COUNT(*) FROM conversation_mutes WHERE conversation_id = 20", Long.class));
        // The keeper carries the most recent activity stamp.
        assertEquals("2025-06-01 00:00:00",
                jdbc.queryForObject("SELECT FORMATDATETIME(updated_at, 'yyyy-MM-dd HH:mm:ss') "
                        + "FROM private_conversations WHERE id = 10", String.class));

        // Idempotent: a second run finds nothing to merge and changes nothing.
        new DatabaseIntegrityMigration().mergeDuplicatePrivateConversations(jdbc);
        assertEquals(List.of(10L, 30L), jdbc.queryForList(
                "SELECT id FROM private_conversations ORDER BY id", Long.class));
    }
}
