package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessRoleRepository extends JpaRepository<BusinessRole, Long> {
    boolean existsByNameIgnoreCase(String name);
    Optional<BusinessRole> findFirstByNameIgnoreCase(String name);
    List<BusinessRole> findAllByOrderByNameAsc();
}
