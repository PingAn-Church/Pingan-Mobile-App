package com.fyp.backend.config.app;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * One-time migration for the move from per-recipient delivery rows to a read
 * watermark per (conversation, user).
 *
 * Read state used to live in message_delivery_status: a row per message per
 * recipient, with status = 'READ' once seen. Unread is now a range comparison
 * against conversation_read_state.last_read_message_id, so without this every
 * existing conversation would come back after the deploy showing its entire
 * history as unread — a badge in the hundreds for anybody who has been using
 * the app.
 *
 * The watermark is derived from what those rows already say: for each
 * (conversation, user), the highest message id they had marked READ. Idempotent
 * — it only inserts pairs that have no read state yet, so a second run does
 * nothing.
 *
 * The old delivery rows are deliberately left in place. Nothing reads them for
 * group conversations any more (MessageDto omits them, so they are invisible),
 * and deleting historical data is not something a startup hook should decide on
 * its own. See the README note for the statement that clears them.
 *
 * This class can be deleted once every environment has booted past it.
 */
@Configuration
public class ReadWatermarkBackfill {

    private static final Logger log = LoggerFactory.getLogger(ReadWatermarkBackfill.class);

    @Bean
    ApplicationRunner backfillReadWatermarks(JdbcTemplate jdbc) {
        return args -> {
            try {
                Integer alreadyTracked = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM conversation_read_state", Integer.class);

                int inserted = jdbc.update("""
                        INSERT INTO conversation_read_state (conversation_id, user_id, last_read_message_id)
                        SELECT m.conversation_id, d.user_id, MAX(m.id)
                        FROM message_delivery_status d
                        JOIN messages m ON m.id = d.message_id
                        WHERE d.status = 'READ'
                        GROUP BY m.conversation_id, d.user_id
                        HAVING NOT EXISTS (
                            SELECT 1 FROM conversation_read_state r
                            WHERE r.conversation_id = m.conversation_id AND r.user_id = d.user_id
                        )
                        """);

                if (inserted > 0) {
                    log.info("Read watermarks: derived {} from existing delivery receipts ({} already tracked).",
                            inserted, alreadyTracked);
                }
            } catch (Exception e) {
                // A fresh database has nothing to migrate, and a non-Postgres dev
                // database may not accept the statement. Neither is worth refusing
                // to start over — the cost is a one-off inflated unread badge.
                log.warn("Read watermark backfill skipped: {}", e.getMessage());
            }
        };
    }
}
