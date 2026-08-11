package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TransitionCoFireGroupRepository extends JpaRepository<TransitionCoFireGroup, Long> {
    List<TransitionCoFireGroup> findByToStepIdOrderByOrderIndexAsc(Long toStepId);
}
