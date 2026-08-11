package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TransitionGroupRepository extends JpaRepository<TransitionGroup, Long> {

    List<TransitionGroup> findByFromStepIdOrderByOrderIndexAsc(Long fromStepId);

    /** Matches a group by source step and condition label, treating null and blank labels as equal. */
    @Query("""
            select g from TransitionGroup g
            where g.fromStepId = :fromStepId
              and ((:label is null and (g.label is null or g.label = '')) or g.label = :label)
            order by g.orderIndex asc
            """)
    List<TransitionGroup> findMatching(@Param("fromStepId") Long fromStepId, @Param("label") String label);

    void deleteByFromStepIdIn(List<Long> fromStepIds);
}
