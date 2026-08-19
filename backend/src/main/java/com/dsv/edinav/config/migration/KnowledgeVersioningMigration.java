package com.dsv.edinav.config.migration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * One-time backfill for knowledge-tree versioning: assigns the new grouping columns
 * ({@code group_id}/{@code version}/{@code is_current}) to pre-existing trees and a stable
 * {@code lineage_key} to pre-existing nodes. Idempotent — only touches rows still missing the value.
 */
@Component
@Order(6)
public class KnowledgeVersioningMigration implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeVersioningMigration.class);

    private final JdbcTemplate jdbc;

    public KnowledgeVersioningMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        if (columnExists("KNOWLEDGE_TREE", "GROUP_ID")) {
            jdbc.update("UPDATE knowledge_tree SET group_id = id WHERE group_id IS NULL");
        }
        if (columnExists("KNOWLEDGE_TREE", "VERSION")) {
            jdbc.update("UPDATE knowledge_tree SET version = 1 WHERE version IS NULL OR version = 0");
        }
        if (columnExists("KNOWLEDGE_TREE", "IS_CURRENT")) {
            jdbc.update("UPDATE knowledge_tree SET is_current = TRUE WHERE is_current IS NULL");
        }
        if (columnExists("KNOWLEDGE_NODE", "LINEAGE_KEY")) {
            int backfilled = jdbc.update(
                    "UPDATE knowledge_node SET lineage_key = RANDOM_UUID() WHERE lineage_key IS NULL");
            if (backfilled > 0) {
                log.info("Knowledge versioning migration: assigned lineage keys to {} existing node(s)", backfilled);
            }
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
