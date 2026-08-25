package com.dsv.edinav.template;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DirTemplateChecklistItemRepository extends JpaRepository<DirTemplateChecklistItem, Long> {
    List<DirTemplateChecklistItem> findByTemplateIdOrderByOrderIndexAsc(Long templateId);
    void deleteByTemplateId(Long templateId);
}
