package com.dsv.edinav.config.migration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * One-time migration for the versioning + Master-removal change: drops the obsolete composition/link
 * tables, deletes any legacy MASTER workflows and their children, backfills the new grouping columns
 * ({@code group_id}/{@code version}/{@code is_current}) for existing rows, then drops the {@code type}
 * column so it never re-runs.
 */
@Component
@Order(2)
public class WorkflowVersioningMigration implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(WorkflowVersioningMigration.class);

    private final JdbcTemplate jdbc;

    public WorkflowVersioningMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        jdbc.execute("DROP TABLE IF EXISTS workflow_composition");
        jdbc.execute("DROP TABLE IF EXISTS workflow_link");

        if (!typeColumnExists()) {
            return;
        }

        List<Long> masterIds = jdbc.queryForList(
                "SELECT id FROM workflow WHERE type = 'MASTER'", Long.class);
        for (Long masterId : masterIds) {
            jdbc.update("DELETE FROM workflow_step_role WHERE step_id IN "
                    + "(SELECT id FROM workflow_step WHERE workflow_id = ?)", masterId);
            jdbc.update("DELETE FROM workflow_transition WHERE from_step_id IN "
                    + "(SELECT id FROM workflow_step WHERE workflow_id = ?) OR to_step_id IN "
                    + "(SELECT id FROM workflow_step WHERE workflow_id = ?)", masterId, masterId);
            jdbc.update("DELETE FROM workflow_step WHERE workflow_id = ?", masterId);
            jdbc.update("DELETE FROM workflow_phase WHERE workflow_id = ?", masterId);
        }
        int removedMasters = jdbc.update("DELETE FROM workflow WHERE type = 'MASTER'");

        jdbc.update("UPDATE workflow SET group_id = id WHERE group_id IS NULL");
        jdbc.update("UPDATE workflow SET version = 1 WHERE version IS NULL OR version = 0");
        jdbc.update("UPDATE workflow SET is_current = TRUE WHERE is_current IS NULL");
        jdbc.execute("ALTER TABLE workflow DROP COLUMN type");

        log.info("Versioning migration: removed {} legacy MASTER workflow(s), backfilled grouping columns, "
                + "dropped workflow.type", removedMasters);
    }

    private boolean typeColumnExists() {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_NAME = 'WORKFLOW' AND COLUMN_NAME = 'TYPE'",
                Integer.class);
        return count != null && count > 0;
    }
}
