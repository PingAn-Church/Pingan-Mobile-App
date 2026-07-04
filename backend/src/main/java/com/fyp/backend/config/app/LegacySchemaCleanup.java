package com.fyp.backend.config.app;

import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * One-time cleanup of tables whose feature has been removed from the codebase.
 *
 * Hibernate's ddl-auto=update only ever adds schema, so dropping the removed
 * "Others" sections feature (entity deleted) leaves its table and rows behind.
 * This runner drops it on startup; DROP TABLE IF EXISTS is idempotent, so the
 * class is safe to keep around and can be deleted once every environment has
 * been deployed at least once past this change.
 */
@Configuration
public class LegacySchemaCleanup {

    @Bean
    ApplicationRunner dropRemovedOthersTable(JdbcTemplate jdbcTemplate) {
        return args -> jdbcTemplate.execute("DROP TABLE IF EXISTS others");
    }
}
