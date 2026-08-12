package com.dsv.edinav.config;

import com.dsv.edinav.user.Role;
import com.dsv.edinav.user.User;
import com.dsv.edinav.user.UserRepository;
import com.dsv.edinav.schematemplate.SchemaTemplate;
import com.dsv.edinav.schematemplate.SchemaTemplateRepository;
import com.dsv.edinav.template.DirTemplate;
import com.dsv.edinav.template.DirTemplateNode;
import com.dsv.edinav.template.DirTemplateRepository;
import com.dsv.edinav.template.DirTemplateNodeRepository;
import com.dsv.edinav.workflow.BusinessRole;
import com.dsv.edinav.workflow.BusinessRoleRepository;
import com.dsv.edinav.workflow.TransitionGroup;
import com.dsv.edinav.workflow.TransitionGroupRepository;
import com.dsv.edinav.workflow.Workflow;
import com.dsv.edinav.workflow.WorkflowRepository;
import com.dsv.edinav.workflow.WorkflowStatus;
import com.dsv.edinav.workflow.WorkflowStep;
import com.dsv.edinav.workflow.WorkflowStepRepository;
import com.dsv.edinav.workflow.WorkflowTransition;
import com.dsv.edinav.workflow.WorkflowTransitionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class DataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AppProperties appProperties;
    private final BusinessRoleRepository roleRepository;
    private final WorkflowRepository workflowRepository;
    private final WorkflowStepRepository stepRepository;
    private final WorkflowTransitionRepository transitionRepository;
    private final TransitionGroupRepository transitionGroupRepository;
    private final DirTemplateRepository templateRepository;
    private final DirTemplateNodeRepository templateNodeRepository;
    private final SchemaTemplateRepository schemaTemplateRepository;

    public DataSeeder(UserRepository userRepository,
                      PasswordEncoder passwordEncoder,
                      AppProperties appProperties,
                      BusinessRoleRepository roleRepository,
                      WorkflowRepository workflowRepository,
                      WorkflowStepRepository stepRepository,
                      WorkflowTransitionRepository transitionRepository,
                      TransitionGroupRepository transitionGroupRepository,
                      DirTemplateRepository templateRepository,
                      DirTemplateNodeRepository templateNodeRepository,
                      SchemaTemplateRepository schemaTemplateRepository) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.appProperties = appProperties;
        this.roleRepository = roleRepository;
        this.workflowRepository = workflowRepository;
        this.stepRepository = stepRepository;
        this.transitionRepository = transitionRepository;
        this.transitionGroupRepository = transitionGroupRepository;
        this.templateRepository = templateRepository;
        this.templateNodeRepository = templateNodeRepository;
        this.schemaTemplateRepository = schemaTemplateRepository;
    }

    @Override
    public void run(String... args) {
        seedAdmin();
        seedWorkflow();
        migrateOrphanSteps();
        seedDefaultTemplate();
        seedSchemaTemplate();
    }

    private void seedAdmin() {
        String username = appProperties.getAdmin().getUsername();
        if (userRepository.existsByUsername(username)) {
            return;
        }
        User admin = new User();
        admin.setUsername(username);
        admin.setPasswordHash(passwordEncoder.encode(appProperties.getAdmin().getPassword()));
        admin.setDisplayName("Administrator");
        admin.setRole(Role.ADMIN);
        userRepository.save(admin);
        log.info("Seeded default admin user '{}'", username);
    }

    private void seedWorkflow() {
        if (stepRepository.count() > 0 || roleRepository.count() > 0) {
            return;
        }

        Long developer = role("Developer", "#1677ff", "EDI map / integration development").getId();
        Long ba = role("BA", "#52c41a", "Business analysis and specification").getId();
        Long bim = role("BIM", "#722ed1", "Business integration mapping / QA review").getId();
        Long cinto = role("CINTO", "#fa8c16", "Deployment and cutover coordination").getId();

        Long wf = workflow("Standard EDI Delivery",
                "Starter sub-workflow: analysis \u2192 development \u2192 QA \u2192 deployment.");

        Long analysis = step(wf, null, 0, "Requirement Analysis", ba,
                "Understand the migration scope and EDI specifications.");
        step(wf, analysis, 0, "Gather EDI Specification", ba, "Collect partner specs and sample messages.");
        step(wf, analysis, 1, "Naming & Flow Design", ba, "Define naming and folder/flow design.");

        Long development = step(wf, null, 1, "Development", developer,
                "Implement maps and integration flows in Sterling / Lightwell.");
        step(wf, development, 0, "Map Creation", developer, "Build the XSLT / map artifacts.");
        step(wf, development, 1, "Unit Test", developer, "Run IB/OB unit tests against sample data.");

        Long qa = step(wf, null, 2, "QA Review", bim, "Review artifacts and QA checklist.");
        Long deploy = step(wf, null, 3, "Deployment", cinto, "Deploy to target environment and verify cutover.");

        // Flow with a branch: QA either approves (-> Deployment) or rejects (-> back to Development).
        transition(analysis, development, "Design approved");
        transition(development, qa, "Ready for review");
        transition(qa, deploy, "If approved");
        transition(qa, development, "If rejected");

        log.info("Seeded starter workflow ({} roles, {} steps)",
                roleRepository.count(), stepRepository.count());
    }

    // Backfill steps created before sub-workflows existed into a single container.
    private void migrateOrphanSteps() {
        var orphans = stepRepository.findByWorkflowIdIsNull();
        if (orphans.isEmpty()) {
            return;
        }
        Long legacy = workflow("Legacy Main", "Steps migrated from the original single global workflow.");
        orphans.forEach(step -> {
            step.setWorkflowId(legacy);
            stepRepository.save(step);
        });
        log.info("Migrated {} legacy step(s) into 'Legacy Main' sub-workflow", orphans.size());
    }

    private Long workflow(String name, String description) {
        Workflow workflow = new Workflow();
        workflow.setName(name);
        workflow.setDescription(description);
        workflow.setStatus(WorkflowStatus.PUBLISHED);
        workflow.setVersion(1);
        workflow.setCurrent(true);
        workflow.setOrderIndex(workflowRepository.nextOrderIndex());
        Workflow saved = workflowRepository.save(workflow);
        saved.setGroupId(saved.getId());
        return workflowRepository.save(saved).getId();
    }

    private BusinessRole role(String name, String color, String description) {
        BusinessRole role = new BusinessRole();
        role.setName(name);
        role.setColor(color);
        role.setDescription(description);
        return roleRepository.save(role);
    }

    private Long step(Long workflowId, Long parentId, int orderIndex, String name, Long roleId, String description) {
        WorkflowStep step = new WorkflowStep();
        step.setWorkflowId(workflowId);
        step.setParentId(parentId);
        step.setOrderIndex(orderIndex);
        step.setName(name);
        List<Long> roleIds = new ArrayList<>();
        if (roleId != null) {
            roleIds.add(roleId);
        }
        step.setBusinessRoleIds(roleIds);
        step.setDescription(description);
        return stepRepository.save(step).getId();
    }

    private void transition(Long fromId, Long toId, String label) {
        String normalized = label == null || label.isBlank() ? null : label.trim();
        TransitionGroup group = new TransitionGroup();
        group.setFromStepId(fromId);
        group.setLabel(normalized);
        group.setOrderIndex(transitionGroupRepository.findByFromStepIdOrderByOrderIndexAsc(fromId).size());
        transitionGroupRepository.save(group);
        WorkflowTransition t = new WorkflowTransition();
        t.setGroupId(group.getId());
        t.setFromStepId(fromId);
        t.setToStepId(toId);
        t.setOrderIndex(transitionRepository.findByGroupIdOrderByOrderIndexAsc(group.getId()).size());
        transitionRepository.save(t);
    }

    private void seedDefaultTemplate() {
        if (templateRepository.count() > 0) {
            return;
        }
        DirTemplate template = new DirTemplate();
        template.setName("DSV EDI Standard");
        template.setDescription("Default QA folder structure based on a standard EDIT project.");
        template.setDefault(true);
        templateRepository.save(template);
        Long tid = template.getId();

        tnode(tid, null, "DESIGN", "Flow design and naming-tool workbooks.");
        tnode(tid, null, "QA Docs", "Deploy request and checklist documents.");

        Long rt = tnode(tid, null, "RT", "Runtime mapping configuration.");
        tnode(tid, rt, "LW", "LiaisonWorks flow definitions (JSON).");
        tnode(tid, rt, "SI", "System integration mapping exports.");

        Long test = tnode(tid, null, "TEST", "Test evidence and samples.");
        tnode(tid, test, "COMP", "Compliance test evidence.");
        tnode(tid, test, "UAT", "User acceptance test evidence.");
        Long unit = tnode(tid, test, "UNIT", "Unit test message samples.");
        Long ib = tnode(tid, unit, "IB", "Inbound message samples.");
        tnode(tid, ib, "ASN", "Advance shipping notice samples.");
        tnode(tid, ib, "SHIPMENTORDER", "Shipment order samples.");
        tnode(tid, ib, "SHIPTO", "Ship-to master samples.");
        tnode(tid, ib, "SKU", "SKU master samples.");
        Long ob = tnode(tid, unit, "OB", "Outbound message samples.");
        tnode(tid, ob, "INVENTORY BALANCE", "Inventory balance samples.");
        tnode(tid, ob, "RECEIPT CONFIRMATION", "Receipt confirmation samples.");

        tnode(tid, null, "XSLT", "XSLT transformation stylesheets.");

        log.info("Seeded default directory template '{}' ({} folders)",
                template.getName(), templateNodeRepository.count());
    }

    private Long tnode(Long templateId, Long parentId, String name) {
        return tnode(templateId, parentId, name, null);
    }

    private Long tnode(Long templateId, Long parentId, String name, String description) {
        DirTemplateNode node = new DirTemplateNode();
        node.setTemplateId(templateId);
        node.setParentId(parentId);
        node.setName(name);
        node.setDescription(description);
        int order = (int) templateNodeRepository.findByTemplateIdOrderByOrderIndexAsc(templateId).stream()
                .filter(n -> (parentId == null && n.getParentId() == null)
                        || (parentId != null && parentId.equals(n.getParentId())))
                .count();
        node.setOrderIndex(order);
        return templateNodeRepository.save(node).getId();
    }

    private void seedSchemaTemplate() {
        if (schemaTemplateRepository.count() > 0) {
            return;
        }
        SchemaTemplate template = new SchemaTemplate();
        template.setName("Sub-Workflow Import Skeleton");
        template.setDescription("The canonical JSON skeleton for POST /api/workflow/workflows/import.");
        template.setVersion("1.0");
        template.setVersionLabel("Initial import from README");
        template.setContent(SUB_WORKFLOW_IMPORT_SKELETON);
        template.setCurrent(true);
        template.setCreatedBy(appProperties.getAdmin().getUsername());
        SchemaTemplate saved = schemaTemplateRepository.save(template);
        saved.setGroupId(saved.getId());
        schemaTemplateRepository.save(saved);
        log.info("Seeded schema template '{}' v{}", saved.getName(), saved.getVersion());
    }

    private static final String SUB_WORKFLOW_IMPORT_SKELETON = """
            {
              "name": "JP-MBL Import Parsing",
              "description": "Reusable sub-workflow for parsing JP MBL import files",
              "status": "DRAFT",             // "DRAFT" | "PUBLISHED" (defaults to DRAFT)
              "phases": [                    // optional swimlanes; steps attach via "phase"
                { "ref": "intake",  "name": "Intake",     "color": "#1677ff", "orderIndex": 0 },
                { "ref": "process", "name": "Processing", "color": "#52c41a", "orderIndex": 1 }
              ],
              "steps": [
                {
                  "ref": "receive",          // unique key within this file
                  "name": "Receive EDI file",
                  "description": "Pick up inbound EDI from the LW mailbox",
                  "notes": "Runs every 5 min",
                  "roles": ["EDI Developer", "QA"],  // names, resolved/created; a step may have several
                  "phase": "intake",         // a phase ref (optional)
                  "children": [
                    { "ref": "validate", "name": "Validate envelope", "roles": ["QA"], "phase": "intake" }
                  ]
                },
                { "ref": "parse",  "name": "Parse segments",  "roles": ["EDI Developer"], "phase": "process" },
                { "ref": "reject", "name": "Reject & notify", "role": "QA" },
                { "ref": "enrich", "name": "Enrich data",   "phase": "process" },
                { "ref": "archive", "name": "Archive",       "phase": "process" }
              ],
              "transitions": [
                // one condition opens several steps: "On valid" starts parse AND enrich together (parallel)
                { "from": "validate", "to": "parse",  "label": "On valid" },
                { "from": "validate", "to": "enrich", "label": "On valid" },
                // a different label on the same "from" is an alternative branch (decision / OR)
                { "from": "validate", "to": "reject", "label": "On error" },
                // co-fire join: "archive" starts only after BOTH parse and enrich have fired
                { "from": "parse",  "to": "archive", "coFireGroup": "ready" },
                { "from": "enrich", "to": "archive", "coFireGroup": "ready" }
              ]
            }
            """;
}
