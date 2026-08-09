package com.dsv.edinav.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * One-time migration from managed tag entities to free-text string tags. Copies each workflow's
 * tag names from the old {@code workflow_tag_link} + {@code workflow_tag} tables into the new
 * {@code workflow_tags} element-collection table, then drops the old tables. Idempotent — guarded
 * by the existence of {@code workflow_tag_link}, which no longer exists after the first run.
 */
@Component
@Order(4)
public class WorkflowTagStringMigration implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(WorkflowTagStringMigration.class);

    private final JdbcTemplate jdbc;

    public WorkflowTagStringMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        if (!tableExists("WORKFLOW_TAG_LINK") || !tableExists("WORKFLOW_TAG")) {
            return;
        }
        int copied = jdbc.update(
                "INSERT INTO workflow_tags (workflow_id, tag) "
                        + "SELECT l.workflow_id, t.name FROM workflow_tag_link l "
                        + "JOIN workflow_tag t ON t.id = l.tag_id "
                        + "WHERE NOT EXISTS (SELECT 1 FROM workflow_tags wt "
                        + "WHERE wt.workflow_id = l.workflow_id AND wt.tag = t.name)");
        jdbc.execute("DROP TABLE workflow_tag_link");
        jdbc.execute("DROP TABLE workflow_tag");
        log.info("Tag migration: converted {} workflow-tag link(s) to string tags; dropped old tables", copied);
    }

    private boolean tableExists(String tableName) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = ?",
                Integer.class, tableName);
        return count != null && count > 0;
    }
}
