package com.dsv.edinav.template;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A required/optional file expected within a template folder (or the template root when nodeId is null). */
@Entity
@Table(name = "dir_template_checklist_item")
public class DirTemplateChecklistItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long templateId;

    /** Folder this item belongs to; null means the template root level. */
    private Long templateNodeId;

    @Column(nullable = false, length = 200)
    private String label;

    @Column(length = 400)
    private String description;

    /** true = mandatory upload, false = optional upload. */
    @Column(nullable = false)
    private boolean required;

    @Column(nullable = false)
    private int orderIndex;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getTemplateId() { return templateId; }
    public void setTemplateId(Long templateId) { this.templateId = templateId; }

    public Long getTemplateNodeId() { return templateNodeId; }
    public void setTemplateNodeId(Long templateNodeId) { this.templateNodeId = templateNodeId; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public boolean isRequired() { return required; }
    public void setRequired(boolean required) { this.required = required; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
}
