package com.dsv.edinav.config.migration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * One-time migration: copies the legacy single {@code workflow_step.business_role_id} column into the
 * new {@code workflow_step_role} collection table, then drops the legacy column so it never re-runs.
 * Steps can now carry multiple roles; this backfills existing single-role data.
 */
@Component
@Order(1)
public class WorkflowStepRoleMigration implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(WorkflowStepRoleMigration.class);

    private final JdbcTemplate jdbc;

    public WorkflowStepRoleMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        if (!legacyColumnExists()) {
            return;
        }
        int copied = jdbc.update(
                "INSERT INTO workflow_step_role (step_id, business_role_id) "
                        + "SELECT s.id, s.business_role_id FROM workflow_step s "
                        + "WHERE s.business_role_id IS NOT NULL "
                        + "AND NOT EXISTS (SELECT 1 FROM workflow_step_role r "
                        + "WHERE r.step_id = s.id AND r.business_role_id = s.business_role_id)");
        jdbc.execute("ALTER TABLE workflow_step DROP COLUMN business_role_id");
        log.info("Migrated {} legacy single-role assignment(s) into workflow_step_role and dropped the legacy column",
                copied);
    }

    private boolean legacyColumnExists() {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_NAME = 'WORKFLOW_STEP' AND COLUMN_NAME = 'BUSINESS_ROLE_ID'",
                Integer.class);
        return count != null && count > 0;
    }
}
