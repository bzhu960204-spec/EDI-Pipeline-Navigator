package com.dsv.edinav.config.migration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * One-time migration to per-user ownership (M17). Backfills the newly added owner columns of the
 * previously global entities (workflow, business_role, workflow_folder, dir_template.created_by,
 * schema_template) to the seeded admin user, and drops the old global-unique name constraints on
 * business_role and workflow_folder (names are now unique per user). Idempotent — the backfills only
 * touch NULL owners and constraint drops are guarded by INFORMATION_SCHEMA lookups.
 */
@Component
@Order(5)
public class WorkflowOwnershipMigration implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(WorkflowOwnershipMigration.class);

    private final JdbcTemplate jdbc;

    public WorkflowOwnershipMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        Long adminId = firstAdminId();
        if (adminId != null) {
            int touched = 0;
            touched += backfill("workflow", "owner_id", adminId);
            touched += backfill("business_role", "owner_id", adminId);
            touched += backfill("workflow_folder", "owner_id", adminId);
            touched += backfill("dir_template", "created_by", adminId);
            touched += backfill("schema_template", "owner_id", adminId);
            if (touched > 0) {
                log.info("Ownership migration: assigned {} legacy row(s) to admin (id {})", touched, adminId);
            }
        }
        dropUniqueConstraints("BUSINESS_ROLE");
        dropUniqueConstraints("WORKFLOW_FOLDER");
    }

    private int backfill(String table, String column, Long adminId) {
        if (!columnExists(table.toUpperCase(), column.toUpperCase())) {
            return 0;
        }
        return jdbc.update("UPDATE " + table + " SET " + column + " = ? WHERE " + column + " IS NULL", adminId);
    }

    private Long firstAdminId() {
        List<Long> ids = jdbc.query(
                "SELECT id FROM app_user WHERE role = 'ADMIN' ORDER BY id",
                (rs, rowNum) -> rs.getLong("id"));
        return ids.isEmpty() ? null : ids.get(0);
    }

    private void dropUniqueConstraints(String table) {
        List<String> names = jdbc.query(
                "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS "
                        + "WHERE TABLE_NAME = ? AND CONSTRAINT_TYPE = 'UNIQUE'",
                (rs, rowNum) -> rs.getString("CONSTRAINT_NAME"), table);
        for (String name : names) {
            jdbc.execute("ALTER TABLE " + table + " DROP CONSTRAINT IF EXISTS \"" + name + "\"");
            log.info("Ownership migration: dropped global-unique constraint {} on {}", name, table);
        }
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }
}
