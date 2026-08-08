package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BusinessRoleRepository extends JpaRepository<BusinessRole, Long> {
    boolean existsByNameIgnoreCase(String name);
    List<BusinessRole> findAllByOrderByNameAsc();
}
