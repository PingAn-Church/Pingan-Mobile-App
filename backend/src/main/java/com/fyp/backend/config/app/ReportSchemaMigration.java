package com.fyp.backend.config.app;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * One-time migration for generalizing message_reports to all content types
 * (chat messages, forum threads/replies, course reviews).
 *
 * Hibernate's ddl-auto=update only ever adds schema, so two leftovers from the
 * chat-only era must be fixed by hand:
 *
 * 1. The UNIQUE constraint on message_id: the column now holds ids from four
 *    different tables, which can collide numerically (thread 5 vs message 5),
 *    so uniqueness is enforced per contentType+contentId in the service instead.
 * 2. Legacy rows have content_type NULL; backfill them to MESSAGE so repository
 *    queries can match on the type directly.
 *
 * Both steps are idempotent; the Postgres catalog queries are wrapped so a
 * non-Postgres dev database only logs a warning. The class can be deleted once
 * every environment has been deployed at least once past this change.
 */
@Configuration
public class ReportSchemaMigration {

    private static final Logger log = LoggerFactory.getLogger(ReportSchemaMigration.class);

    @Bean
    ApplicationRunner generalizeMessageReports(JdbcTemplate jdbc) {
        return args -> {
            try {
                List<String> constraints = jdbc.queryForList("""
                        SELECT con.conname
                        FROM pg_constraint con
                        JOIN pg_class rel ON rel.oid = con.conrelid
                        JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
                        WHERE rel.relname = 'message_reports' AND con.contype = 'u' AND att.attname = 'message_id'
                        """, String.class);
                for (String name : constraints) {
                    jdbc.execute("ALTER TABLE message_reports DROP CONSTRAINT \"" + name + "\"");
                    log.info("Dropped unique constraint {} on message_reports.message_id", name);
                }

                // A unique index without a backing constraint (dialect-dependent form).
                List<String> indexes = jdbc.queryForList("""
                        SELECT i.relname
                        FROM pg_index ix
                        JOIN pg_class t ON t.oid = ix.indrelid
                        JOIN pg_class i ON i.oid = ix.indexrelid
                        JOIN pg_attribute att ON att.attrelid = t.oid AND att.attnum = ANY(ix.indkey)
                        WHERE t.relname = 'message_reports' AND ix.indisunique AND att.attname = 'message_id'
                          AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = ix.indexrelid)
                        """, String.class);
                for (String name : indexes) {
                    jdbc.execute("DROP INDEX IF EXISTS \"" + name + "\"");
                    log.info("Dropped unique index {} on message_reports.message_id", name);
                }

                int backfilled = jdbc.update(
                        "UPDATE message_reports SET content_type = 'MESSAGE' WHERE content_type IS NULL");
                if (backfilled > 0) {
                    log.info("Backfilled content_type=MESSAGE on {} legacy report rows", backfilled);
                }
            } catch (Exception e) {
                log.warn("Skipping message_reports schema migration: {}", e.getMessage());
            }
        };
    }
}
