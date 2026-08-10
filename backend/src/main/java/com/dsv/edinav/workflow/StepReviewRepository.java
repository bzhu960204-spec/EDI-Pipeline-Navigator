package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface StepReviewRepository extends JpaRepository<StepReview, Long> {
    List<StepReview> findByStepIdOrderByCreatedAtDescIdDesc(Long stepId);

    List<StepReview> findByStepIdInOrderByCreatedAtDescIdDesc(Collection<Long> stepIds);

    void deleteByStepIdIn(Collection<Long> stepIds);

    void deleteByStepId(Long stepId);
}
