package com.dsv.edinav.config.migration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * One-time backfill for artifact versioning: gives every pre-existing artifact a v1 snapshot row and
 * points its existing nodes + checklist items at that version. Idempotent — only creates a v1 for
 * artifacts that have none, and only stamps rows whose {@code version_id} is still null. File content
 * hashes are NOT backfilled here (computed lazily by the service when a diff first needs them).
 */
@Component
@Order(7)
public class ArtifactVersioningMigration implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(ArtifactVersioningMigration.class);

    private final JdbcTemplate jdbc;

    public ArtifactVersioningMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        if (!tableExists("ARTIFACT_VERSION") || !columnExists("ARTIFACT_NODE", "VERSION_ID")) {
            return;
        }
        int created = jdbc.update(
                "INSERT INTO artifact_version (artifact_id, version_number, comment, created_by, created_at, is_current) "
                        + "SELECT a.id, 1, NULL, a.owner_id, CURRENT_TIMESTAMP, TRUE FROM artifact a "
                        + "WHERE NOT EXISTS (SELECT 1 FROM artifact_version v WHERE v.artifact_id = a.id)");
        int nodes = jdbc.update(
                "UPDATE artifact_node n SET version_id = "
                        + "(SELECT v.id FROM artifact_version v WHERE v.artifact_id = n.artifact_id AND v.version_number = 1) "
                        + "WHERE version_id IS NULL");
        if (columnExists("ARTIFACT_CHECKLIST_ITEM", "VERSION_ID")) {
            jdbc.update(
                    "UPDATE artifact_checklist_item c SET version_id = "
                            + "(SELECT v.id FROM artifact_version v WHERE v.artifact_id = c.artifact_id AND v.version_number = 1) "
                            + "WHERE version_id IS NULL");
        }
        if (created > 0) {
            log.info("Artifact versioning migration: created {} v1 snapshot(s), stamped {} node(s)", created, nodes);
        }
    }

    private boolean tableExists(String table) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = ?",
                Integer.class, table);
        return count != null && count > 0;
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }
}
