package com.fyp.backend.config.app;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/** Installs database guarantees that Hibernate's ddl-auto cannot express. */
@Configuration
public class DatabaseIntegrityMigration {

    private static final Logger log = LoggerFactory.getLogger(DatabaseIntegrityMigration.class);

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    ApplicationRunner enforceDatabaseIntegrity(JdbcTemplate jdbc, TransactionTemplate transactions) {
        return args -> {
            if (!isPostgres(jdbc.getDataSource())) {
                log.debug("Skipping PostgreSQL-specific integrity migration on this database.");
                return;
            }
            transactions.executeWithoutResult(status -> migratePostgres(jdbc));
        };
    }

    void migratePostgres(JdbcTemplate jdbc) {
        // Rolling deployments can start multiple instances together. Serialize
        // this DDL inside the transaction so two nodes never race to replace the
        // same foreign key or create the same constraint.
        jdbc.execute("SELECT pg_advisory_xact_lock(7046029254386353131)");

        List<Long> appGroupIds = jdbc.queryForList(
                "SELECT id FROM group_conversations WHERE app_level = TRUE ORDER BY id", Long.class);
        requireSingleAppGroup(appGroupIds);

        int orphanMentions = jdbc.update("""
                DELETE FROM message_mentions mm
                WHERE NOT EXISTS (SELECT 1 FROM messages m WHERE m.id = mm.message_id)
                   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = mm.user_id)
                """);
        int orphanSubscriptions = jdbc.update("""
                DELETE FROM thread_subscriptions ts
                WHERE NOT EXISTS (SELECT 1 FROM threads t WHERE t.id = ts.thread_id)
                   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ts.user_id)
                """);
        if (orphanMentions + orphanSubscriptions > 0) {
            log.warn("Removed {} orphan mention row(s) and {} orphan topic subscription row(s).",
                    orphanMentions, orphanSubscriptions);
        }
        int orphanRegistrations = jdbc.update("""
                DELETE FROM event_registrations er
                WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = er.event_id)
                   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = er.user_id)
                """);
        if (orphanRegistrations > 0) {
            log.warn("Removed {} orphan event registration row(s).", orphanRegistrations);
        }
        int orphanReactions = jdbc.update("""
                DELETE FROM message_reactions mr
                WHERE NOT EXISTS (SELECT 1 FROM messages m WHERE m.id = mr.message_id)
                   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = mr.user_id)
                """);
        if (orphanReactions > 0) {
            log.warn("Removed {} orphan message reaction row(s).", orphanReactions);
        }
        // Polls whose message is gone, then options and votes whose parent is gone
        // — children first would leave the parents' own orphans behind.
        int orphanPolls = jdbc.update("""
                DELETE FROM polls p
                WHERE p.message_id IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.id = p.message_id)
                """);
        int orphanPollOptions = jdbc.update("""
                DELETE FROM poll_options o
                WHERE NOT EXISTS (SELECT 1 FROM polls p WHERE p.id = o.poll_id)
                """);
        int orphanPollVotes = jdbc.update("""
                DELETE FROM poll_votes v
                WHERE NOT EXISTS (SELECT 1 FROM polls p WHERE p.id = v.poll_id)
                   OR NOT EXISTS (SELECT 1 FROM poll_options o WHERE o.id = v.option_id)
                   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = v.user_id)
                """);
        if (orphanPolls + orphanPollOptions + orphanPollVotes > 0) {
            log.warn("Removed {} orphan poll(s), {} option row(s) and {} vote row(s).",
                    orphanPolls, orphanPollOptions, orphanPollVotes);
        }

        ensureCascadeForeignKey(jdbc, "message_mentions", "message_id",
                "messages", "id", "fk_message_mentions_message");
        ensureCascadeForeignKey(jdbc, "message_mentions", "user_id",
                "users", "id", "fk_message_mentions_user");
        ensureCascadeForeignKey(jdbc, "thread_subscriptions", "thread_id",
                "threads", "id", "fk_thread_subscriptions_thread");
        ensureCascadeForeignKey(jdbc, "thread_subscriptions", "user_id",
                "users", "id", "fk_thread_subscriptions_user");
        // Deleting an event, or an account, takes its sign-ups with it.
        ensureCascadeForeignKey(jdbc, "event_registrations", "event_id",
                "events", "id", "fk_event_registrations_event");
        ensureCascadeForeignKey(jdbc, "event_registrations", "user_id",
                "users", "id", "fk_event_registrations_user");
        // A reaction lives and dies with its message and its owner.
        ensureCascadeForeignKey(jdbc, "message_reactions", "message_id",
                "messages", "id", "fk_message_reactions_message");
        ensureCascadeForeignKey(jdbc, "message_reactions", "user_id",
                "users", "id", "fk_message_reactions_user");
        // A poll goes with its message; its options and votes go with it; a vote
        // goes with its voter. Who created what is a pointer that outlives them.
        ensureCascadeForeignKey(jdbc, "polls", "message_id", "messages", "id", "fk_polls_message");
        ensureForeignKey(jdbc, "polls", "creator_id", "users", "id", "fk_polls_creator", "SET NULL");
        ensureCascadeForeignKey(jdbc, "poll_options", "poll_id", "polls", "id", "fk_poll_options_poll");
        ensureForeignKey(jdbc, "poll_options", "created_by_id", "users", "id",
                "fk_poll_options_created_by", "SET NULL");
        ensureCascadeForeignKey(jdbc, "poll_votes", "poll_id", "polls", "id", "fk_poll_votes_poll");
        ensureCascadeForeignKey(jdbc, "poll_votes", "option_id", "poll_options", "id", "fk_poll_votes_option");
        ensureCascadeForeignKey(jdbc, "poll_votes", "user_id", "users", "id", "fk_poll_votes_user");

        jdbc.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_group_conversations_single_app_level
                ON group_conversations (app_level)
                WHERE app_level = TRUE
                """);

        // Chat messages outgrew varchar(255) when the assistant started quoting
        // scripture. Mapping the field as text is not enough on an existing
        // database: ddl-auto=update only ADDS tables and columns, it never alters
        // the type of one that is already there — so the entity said text, the
        // column stayed varchar(255), and every reply carrying a verse failed to
        // insert while short ones sailed through.
        widenToText(jdbc, "messages", "content");

        // One assistant reply per triggering message, enforced by the database.
        //
        // The queue is at-least-once and the listener's retry advice re-runs a
        // failed handler in-process, so a worker that posts a reply and then throws
        // would post a second one. Redis holds a claim/done marker as the cheap
        // filter, but this index is the guarantee: it survives an eviction, a flush
        // and a restart, and it is what a duplicate insert actually collides with.
        //
        // Partial, because every message a person sends leaves this column NULL.
        jdbc.update("""
                UPDATE messages SET responds_to_message_id = NULL
                WHERE responds_to_message_id IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM messages parent
                                  WHERE parent.id = messages.responds_to_message_id)
                """);
        jdbc.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_responds_to
                ON messages (responds_to_message_id)
                WHERE responds_to_message_id IS NOT NULL
                """);
        // SET NULL, not CASCADE: deleting your question must not delete the answer
        // the whole group has already read.
        ensureForeignKey(jdbc, "messages", "responds_to_message_id",
                "messages", "id", "fk_messages_responds_to", "SET NULL");
        // A reply outlives what it quotes: delete the original and the reply keeps
        // its own words, minus the quote. Hibernate regenerates its plain key on
        // this mapped column every boot; the steady-state churn is documented above.
        ensureForeignKey(jdbc, "messages", "reply_to_message_id",
                "messages", "id", "fk_messages_reply_to", "SET NULL");
        // A group's pinned message and its "📌" announcement are pointers: deleting
        // either message clears the pointer rather than refusing the delete.
        ensureForeignKey(jdbc, "group_conversations", "pinned_message_id",
                "messages", "id", "fk_group_conversations_pinned_message", "SET NULL");
        ensureForeignKey(jdbc, "group_conversations", "pinned_notice_message_id",
                "messages", "id", "fk_group_conversations_pinned_notice", "SET NULL");

        // One private conversation per pair of users. Duplicates created before this
        // guard existed are merged into the oldest conversation FIRST — the unique
        // index below would otherwise refuse to build. Both run under the advisory
        // lock above, and on every later boot the merge finds nothing and no-ops.
        mergeDuplicatePrivateConversations(jdbc);
        jdbc.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_private_conversations_pair
                ON private_conversations (LEAST(user_one_id, user_two_id),
                                          GREATEST(user_one_id, user_two_id))
                """);
    }

    /**
     * Merges duplicate private conversations between the same two users into the
     * oldest one. Duplicates arose from races/two devices before
     * createPrivateConversation gained its pair guard; each split the pair's
     * history. Messages are repointed wholesale — message_mentions and
     * message_delivery_status reference messages by message_id only, so they ride
     * along and need no step of their own. Read watermarks merge to the furthest
     * position per user; mutes move only where the keeper has none.
     *
     * Kept H2-portable (no Postgres-only syntax) so the test suite can exercise it;
     * a congregation-sized app has at most a handful of duplicates, so the per-pair
     * Java loop costs nothing.
     */
    void mergeDuplicatePrivateConversations(JdbcTemplate jdbc) {
        List<Map<String, Object>> dups = jdbc.queryForList("""
                SELECT pc.id AS dup_id, k.keep_id
                FROM private_conversations pc
                JOIN (SELECT LEAST(user_one_id, user_two_id) AS u1,
                             GREATEST(user_one_id, user_two_id) AS u2,
                             MIN(id) AS keep_id
                      FROM private_conversations
                      GROUP BY LEAST(user_one_id, user_two_id),
                               GREATEST(user_one_id, user_two_id)
                      HAVING COUNT(*) > 1) k
                  ON LEAST(pc.user_one_id, pc.user_two_id) = k.u1
                 AND GREATEST(pc.user_one_id, pc.user_two_id) = k.u2
                WHERE pc.id <> k.keep_id
                ORDER BY pc.id
                """);
        if (dups.isEmpty()) {
            return;
        }

        for (Map<String, Object> row : dups) {
            long dup = ((Number) row.get("dup_id")).longValue();
            long keep = ((Number) row.get("keep_id")).longValue();

            // Messages (and their mention/delivery-status children, via message_id).
            jdbc.update("UPDATE messages SET conversation_id = ? WHERE conversation_id = ?",
                    keep, dup);

            // Read watermarks, respecting the (conversation_id, user_id) unique:
            // where the user has a row on both sides, keep the furthest position...
            jdbc.update("""
                    UPDATE conversation_read_state SET last_read_message_id =
                        GREATEST(COALESCE(last_read_message_id, 0),
                                 COALESCE((SELECT d.last_read_message_id
                                           FROM conversation_read_state d
                                           WHERE d.conversation_id = ?
                                             AND d.user_id = conversation_read_state.user_id), 0))
                    WHERE conversation_id = ?
                      AND EXISTS (SELECT 1 FROM conversation_read_state d
                                  WHERE d.conversation_id = ?
                                    AND d.user_id = conversation_read_state.user_id)
                    """, dup, keep, dup);
            // ...move rows only the duplicate has...
            jdbc.update("""
                    UPDATE conversation_read_state SET conversation_id = ?
                    WHERE conversation_id = ?
                      AND NOT EXISTS (SELECT 1 FROM conversation_read_state k
                                      WHERE k.conversation_id = ?
                                        AND k.user_id = conversation_read_state.user_id)
                    """, keep, dup, keep);
            // ...and drop what remains on the duplicate.
            jdbc.update("DELETE FROM conversation_read_state WHERE conversation_id = ?", dup);

            // Mutes: same move-where-absent scheme; the unique includes conversation_type.
            jdbc.update("""
                    UPDATE conversation_mutes SET conversation_id = ?
                    WHERE conversation_id = ?
                      AND NOT EXISTS (SELECT 1 FROM conversation_mutes k
                                      WHERE k.conversation_id = ?
                                        AND k.user_id = conversation_mutes.user_id
                                        AND k.conversation_type = conversation_mutes.conversation_type)
                    """, keep, dup, keep);
            jdbc.update("DELETE FROM conversation_mutes WHERE conversation_id = ?", dup);

            // Keep the most recent activity stamp, then retire the duplicate row.
            jdbc.update("""
                    UPDATE private_conversations SET updated_at = GREATEST(
                        COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00'),
                        COALESCE((SELECT d.updated_at FROM private_conversations d WHERE d.id = ?),
                                 TIMESTAMP '1970-01-01 00:00:00'))
                    WHERE id = ?
                    """, dup, keep);
            jdbc.update("DELETE FROM private_conversations WHERE id = ?", dup);
        }
        log.warn("Merged {} duplicate private conversation(s) into their oldest counterpart.",
                dups.size());
    }

    static void requireSingleAppGroup(List<Long> ids) {
        if (ids.size() > 1) {
            throw new IllegalStateException(
                    "Multiple app-level groups exist; resolve them before startup. IDs: " + ids);
        }
    }

    /**
     * Replaces whatever foreign key sits on this column with a named cascading one.
     *
     * Expect this to do real work on every boot rather than settling into a no-op.
     * Hibernate matches foreign keys by name, so `ddl-auto=update` re-adds its own
     * generated `FK…` on columns it maps — this runner then drops it and reinstates
     * the cascading one. That churn is by design and harmless (one DDL statement
     * per column, under the advisory lock above); it is only worth investigating if
     * the log shows something other than that steady state.
     */
    private void ensureCascadeForeignKey(JdbcTemplate jdbc, String table, String column,
            String targetTable, String targetColumn, String desiredName) {
        ensureForeignKey(jdbc, table, column, targetTable, targetColumn, desiredName, "CASCADE");
    }

    /**
     * As above, but the delete action is the caller's choice.
     *
     * SET NULL is right where the child row outlives its parent: an assistant reply
     * is something a whole group has already read, so deleting the question it
     * answered must not take the answer with it.
     */
    private void ensureForeignKey(JdbcTemplate jdbc, String table, String column,
            String targetTable, String targetColumn, String desiredName, String deleteAction) {
        // pg_constraint records the action as a single char: 'c' cascade, 'n' set null.
        String expectedAction = "SET NULL".equalsIgnoreCase(deleteAction) ? "n" : "c";
        List<Map<String, Object>> constraints = jdbc.queryForList("""
                SELECT con.conname,
                       con.confdeltype::text AS delete_action,
                       target.relname AS target_table,
                       target_att.attname AS target_column
                FROM pg_constraint con
                JOIN pg_class source ON source.oid = con.conrelid
                JOIN pg_namespace source_ns ON source_ns.oid = source.relnamespace
                JOIN pg_attribute source_att
                  ON source_att.attrelid = source.oid AND source_att.attnum = con.conkey[1]
                JOIN pg_class target ON target.oid = con.confrelid
                JOIN pg_attribute target_att
                  ON target_att.attrelid = target.oid AND target_att.attnum = con.confkey[1]
                WHERE con.contype = 'f'
                  AND source_ns.nspname = current_schema()
                  AND source.relname = ?
                  AND source_att.attname = ?
                """, table, column);

        boolean desiredExists = false;
        for (Map<String, Object> constraint : constraints) {
            String name = String.valueOf(constraint.get("conname"));
            boolean desired = desiredName.equals(name)
                    && expectedAction.equals(String.valueOf(constraint.get("delete_action")))
                    && targetTable.equals(String.valueOf(constraint.get("target_table")))
                    && targetColumn.equals(String.valueOf(constraint.get("target_column")));
            if (desired) {
                desiredExists = true;
            } else {
                jdbc.execute("ALTER TABLE " + quote(table) + " DROP CONSTRAINT " + quote(name));
            }
        }

        if (!desiredExists) {
            jdbc.execute("ALTER TABLE " + quote(table)
                    + " ADD CONSTRAINT " + quote(desiredName)
                    + " FOREIGN KEY (" + quote(column) + ") REFERENCES " + quote(targetTable)
                    + " (" + quote(targetColumn) + ") ON DELETE " + deleteAction);
        }
    }

    /**
     * Converts a length-limited character column to unbounded text.
     *
     * Checked first so this is a no-op on every boot after the first: in PostgreSQL
     * varchar(n) and text share a storage format, so the conversion is a catalogue
     * change with no table rewrite, but it still takes an ACCESS EXCLUSIVE lock and
     * there is no reason to take one for nothing.
     */
    private void widenToText(JdbcTemplate jdbc, String table, String column) {
        List<Map<String, Object>> found = jdbc.queryForList("""
                SELECT data_type
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = ?
                  AND column_name = ?
                """, table, column);
        if (found.isEmpty()) {
            return;
        }
        String type = String.valueOf(found.get(0).get("data_type"));
        if ("text".equalsIgnoreCase(type)) {
            return;
        }
        // Rejected, not truncated: PostgreSQL refuses the whole INSERT rather than
        // clipping the value, so nothing was ever half-saved.
        log.warn("Widening {}.{} from {} to text — inserts over the old limit were "
                + "being rejected.", table, column, type);
        jdbc.execute("ALTER TABLE " + quote(table) + " ALTER COLUMN " + quote(column)
                + " TYPE text");
    }

    private static String quote(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }

    static boolean isPostgres(DataSource dataSource) {
        if (dataSource == null) return false;
        try (Connection connection = dataSource.getConnection()) {
            return connection.getMetaData().getDatabaseProductName().toLowerCase().contains("postgresql");
        } catch (SQLException e) {
            throw new IllegalStateException("Could not identify the database for integrity migration", e);
        }
    }
}
