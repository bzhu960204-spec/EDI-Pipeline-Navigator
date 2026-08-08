package com.dsv.edinav.template;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DirTemplateNodeRepository extends JpaRepository<DirTemplateNode, Long> {
    List<DirTemplateNode> findByTemplateIdOrderByOrderIndexAsc(Long templateId);
    void deleteByTemplateId(Long templateId);
}
