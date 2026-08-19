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

        ensureCascadeForeignKey(jdbc, "message_mentions", "message_id",
                "messages", "id", "fk_message_mentions_message");
        ensureCascadeForeignKey(jdbc, "message_mentions", "user_id",
                "users", "id", "fk_message_mentions_user");
        ensureCascadeForeignKey(jdbc, "thread_subscriptions", "thread_id",
                "threads", "id", "fk_thread_subscriptions_thread");
        ensureCascadeForeignKey(jdbc, "thread_subscriptions", "user_id",
                "users", "id", "fk_thread_subscriptions_user");

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
        log.warn("Widening {}.{} from {} to text — messages were being truncated at the "
                + "old limit.", table, column, type);
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
