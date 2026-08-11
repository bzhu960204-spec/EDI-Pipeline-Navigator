package com.dsv.edinav.config.migration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Component;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Types;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * One-time migration that moves the legacy per-edge {@code workflow_transition.label} into the new
 * {@code workflow_transition_group} rows: each distinct (from_step_id, label) becomes a group, its
 * edges get {@code group_id}, then the obsolete {@code label} column is dropped so it never re-runs.
 */
@Component
@Order(3)
public class TransitionGroupMigration implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(TransitionGroupMigration.class);

    private final JdbcTemplate jdbc;

    public TransitionGroupMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        if (!labelColumnExists()) {
            return;
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT from_step_id AS FROM_ID, label AS LBL, MIN(order_index) AS MIN_ORDER "
                        + "FROM workflow_transition WHERE group_id IS NULL "
                        + "GROUP BY from_step_id, label ORDER BY from_step_id, MIN(order_index)");
        Map<Long, Integer> orderByFrom = new HashMap<>();
        int groupCount = 0;
        for (Map<String, Object> row : rows) {
            Long fromId = ((Number) row.get("FROM_ID")).longValue();
            Object lblObj = row.get("LBL");
            String label = lblObj == null ? null : lblObj.toString();
            int orderIndex = orderByFrom.merge(fromId, 1, Integer::sum) - 1;

            KeyHolder keyHolder = new GeneratedKeyHolder();
            jdbc.update(con -> {
                PreparedStatement ps = con.prepareStatement(
                        "INSERT INTO workflow_transition_group (from_step_id, label, order_index) VALUES (?, ?, ?)",
                        Statement.RETURN_GENERATED_KEYS);
                ps.setLong(1, fromId);
                if (label == null) {
                    ps.setNull(2, Types.VARCHAR);
                } else {
                    ps.setString(2, label);
                }
                ps.setInt(3, orderIndex);
                return ps;
            }, keyHolder);
            Long groupId = keyHolder.getKey().longValue();
            groupCount++;

            if (label == null) {
                jdbc.update("UPDATE workflow_transition SET group_id = ? "
                        + "WHERE from_step_id = ? AND label IS NULL AND group_id IS NULL", groupId, fromId);
            } else {
                jdbc.update("UPDATE workflow_transition SET group_id = ? "
                        + "WHERE from_step_id = ? AND label = ? AND group_id IS NULL", groupId, fromId, label);
            }
        }
        jdbc.execute("ALTER TABLE workflow_transition DROP COLUMN label");
        log.info("Transition-group migration: created {} group(s) from legacy transition labels, dropped label column",
                groupCount);
    }

    private boolean labelColumnExists() {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_NAME = 'WORKFLOW_TRANSITION' AND COLUMN_NAME = 'LABEL'",
                Integer.class);
        return count != null && count > 0;
    }
}
