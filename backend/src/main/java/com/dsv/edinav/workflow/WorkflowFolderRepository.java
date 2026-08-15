package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface WorkflowFolderRepository extends JpaRepository<WorkflowFolder, Long> {
    boolean existsByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCaseAndOwnerId(String name, Long ownerId);
    boolean existsByNameIgnoreCaseAndOwnerIdAndIdNot(String name, Long ownerId, Long id);
    List<WorkflowFolder> findAllByOrderByOrderIndexAscNameAsc();
    List<WorkflowFolder> findByOwnerIdOrderByOrderIndexAscNameAsc(Long ownerId);
    List<WorkflowFolder> findByParentId(Long parentId);
    long countByOwnerId(Long ownerId);

    // Sibling-scoped name uniqueness: names must be unique only among folders sharing the same parent.
    @Query("SELECT COUNT(f) > 0 FROM WorkflowFolder f WHERE f.ownerId = :ownerId "
            + "AND LOWER(f.name) = LOWER(:name) "
            + "AND ((:parentId IS NULL AND f.parentId IS NULL) OR f.parentId = :parentId)")
    boolean existsSiblingName(@Param("ownerId") Long ownerId, @Param("name") String name,
                              @Param("parentId") Long parentId);

    @Query("SELECT COUNT(f) > 0 FROM WorkflowFolder f WHERE f.ownerId = :ownerId "
            + "AND LOWER(f.name) = LOWER(:name) "
            + "AND ((:parentId IS NULL AND f.parentId IS NULL) OR f.parentId = :parentId) "
            + "AND f.id <> :excludeId")
    boolean existsSiblingNameExcludingId(@Param("ownerId") Long ownerId, @Param("name") String name,
                                         @Param("parentId") Long parentId, @Param("excludeId") Long excludeId);
}
