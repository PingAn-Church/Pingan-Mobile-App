package com.fyp.backend.repository;

import java.sql.Connection;
import java.sql.SQLException;

import javax.sql.DataSource;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;

public class ConversationReadStateRepositoryCustomImpl implements ConversationReadStateRepositoryCustom {

    private final JdbcTemplate jdbc;
    private final boolean postgres;

    public ConversationReadStateRepositoryCustomImpl(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        this.postgres = isPostgres(jdbc.getDataSource());
    }

    @Override
    public int advanceWatermark(Long conversationId, Long userId, Long messageId) {
        if (conversationId == null || userId == null || messageId == null) return 0;

        if (postgres) {
            return jdbc.update("""
                    INSERT INTO conversation_read_state
                        (conversation_id, user_id, last_read_message_id)
                    VALUES (?, ?, ?)
                    ON CONFLICT (conversation_id, user_id) DO UPDATE
                    SET last_read_message_id = GREATEST(
                        COALESCE(conversation_read_state.last_read_message_id,
                                 EXCLUDED.last_read_message_id),
                        EXCLUDED.last_read_message_id)
                    """, conversationId, userId, messageId);
        }

        int updated = updateExisting(conversationId, userId, messageId);
        if (updated > 0) return updated;

        try {
            return jdbc.update("""
                    INSERT INTO conversation_read_state
                        (conversation_id, user_id, last_read_message_id)
                    VALUES (?, ?, ?)
                    """, conversationId, userId, messageId);
        } catch (DuplicateKeyException race) {
            return updateExisting(conversationId, userId, messageId);
        }
    }

    private int updateExisting(Long conversationId, Long userId, Long messageId) {
        return jdbc.update("""
                UPDATE conversation_read_state
                SET last_read_message_id = CASE
                    WHEN last_read_message_id IS NULL OR last_read_message_id < ? THEN ?
                    ELSE last_read_message_id
                END
                WHERE conversation_id = ? AND user_id = ?
                """, messageId, messageId, conversationId, userId);
    }

    private static boolean isPostgres(DataSource dataSource) {
        if (dataSource == null) return false;
        try (Connection connection = dataSource.getConnection()) {
            return connection.getMetaData().getDatabaseProductName().toLowerCase().contains("postgresql");
        } catch (SQLException e) {
            throw new IllegalStateException("Could not identify the database for read-watermark writes", e);
        }
    }
}
