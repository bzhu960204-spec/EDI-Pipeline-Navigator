package com.dsv.edinav.vartabletemplate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface VarTableTemplateRepository extends JpaRepository<VarTableTemplate, Long> {

    List<VarTableTemplate> findByOwnerIdOrderByNameAsc(Long ownerId);

    Optional<VarTableTemplate> findFirstByOwnerIdAndNameIgnoreCase(Long ownerId, String name);

    Optional<VarTableTemplate> findFirstByOwnerIdAndNameIgnoreCaseAndIdNot(Long ownerId, String name, Long id);
}
