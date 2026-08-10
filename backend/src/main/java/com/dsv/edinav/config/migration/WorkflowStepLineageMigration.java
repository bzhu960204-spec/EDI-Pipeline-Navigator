package com.dsv.edinav.config.migration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * One-time backfill for the lineageKey feature: assigns a random UUID to any existing workflow step
 * that predates the column so future version compares can align steps by lineage. Idempotent — only
 * touches rows whose {@code lineage_key} is still null.
 */
@Component
@Order(3)
public class WorkflowStepLineageMigration implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(WorkflowStepLineageMigration.class);

    private final JdbcTemplate jdbc;

    public WorkflowStepLineageMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        if (!lineageKeyColumnExists()) {
            return;
        }
        int backfilled = jdbc.update("UPDATE workflow_step SET lineage_key = RANDOM_UUID() WHERE lineage_key IS NULL");
        if (backfilled > 0) {
            log.info("Lineage migration: assigned lineage keys to {} existing step(s)", backfilled);
        }
    }

    private boolean lineageKeyColumnExists() {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_NAME = 'WORKFLOW_STEP' AND COLUMN_NAME = 'LINEAGE_KEY'",
                Integer.class);
        return count != null && count > 0;
    }
}
