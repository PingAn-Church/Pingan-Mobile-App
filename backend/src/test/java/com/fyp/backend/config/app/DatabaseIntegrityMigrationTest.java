package com.fyp.backend.config.app;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;

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
}
