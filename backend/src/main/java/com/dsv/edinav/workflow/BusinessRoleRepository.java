package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessRoleRepository extends JpaRepository<BusinessRole, Long> {
    boolean existsByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCaseAndOwnerId(String name, Long ownerId);
    Optional<BusinessRole> findFirstByNameIgnoreCase(String name);
    Optional<BusinessRole> findFirstByOwnerIdAndNameIgnoreCase(Long ownerId, String name);
    List<BusinessRole> findAllByOrderByNameAsc();
    List<BusinessRole> findByOwnerIdOrderByNameAsc(Long ownerId);
}
