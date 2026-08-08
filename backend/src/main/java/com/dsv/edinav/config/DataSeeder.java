package com.dsv.edinav.config;

import com.dsv.edinav.user.Role;
import com.dsv.edinav.user.User;
import com.dsv.edinav.user.UserRepository;
import com.dsv.edinav.template.DirTemplate;
import com.dsv.edinav.template.DirTemplateNode;
import com.dsv.edinav.template.DirTemplateRepository;
import com.dsv.edinav.template.DirTemplateNodeRepository;
import com.dsv.edinav.workflow.BusinessRole;
import com.dsv.edinav.workflow.BusinessRoleRepository;
import com.dsv.edinav.workflow.Workflow;
import com.dsv.edinav.workflow.WorkflowRepository;
import com.dsv.edinav.workflow.WorkflowStatus;
import com.dsv.edinav.workflow.WorkflowStep;
import com.dsv.edinav.workflow.WorkflowStepRepository;
import com.dsv.edinav.workflow.WorkflowTransition;
import com.dsv.edinav.workflow.WorkflowTransitionRepository;
import com.dsv.edinav.workflow.WorkflowType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

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
    private final DirTemplateRepository templateRepository;
    private final DirTemplateNodeRepository templateNodeRepository;

    public DataSeeder(UserRepository userRepository,
                      PasswordEncoder passwordEncoder,
                      AppProperties appProperties,
                      BusinessRoleRepository roleRepository,
                      WorkflowRepository workflowRepository,
                      WorkflowStepRepository stepRepository,
                      WorkflowTransitionRepository transitionRepository,
                      DirTemplateRepository templateRepository,
                      DirTemplateNodeRepository templateNodeRepository) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.appProperties = appProperties;
        this.roleRepository = roleRepository;
        this.workflowRepository = workflowRepository;
        this.stepRepository = stepRepository;
        this.transitionRepository = transitionRepository;
        this.templateRepository = templateRepository;
        this.templateNodeRepository = templateNodeRepository;
    }

    @Override
    public void run(String... args) {
        seedAdmin();
        seedWorkflow();
        migrateOrphanSteps();
        seedDefaultTemplate();
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
        workflow.setType(WorkflowType.SUB);
        workflow.setStatus(WorkflowStatus.PUBLISHED);
        workflow.setOrderIndex(workflowRepository.nextOrderIndex());
        return workflowRepository.save(workflow).getId();
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
        step.setBusinessRoleId(roleId);
        step.setDescription(description);
        return stepRepository.save(step).getId();
    }

    private void transition(Long fromId, Long toId, String label) {
        WorkflowTransition t = new WorkflowTransition();
        t.setFromStepId(fromId);
        t.setToStepId(toId);
        t.setLabel(label);
        int order = transitionRepository.findByFromStepIdOrderByOrderIndexAsc(fromId).size();
        t.setOrderIndex(order);
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

        tnode(tid, null, "DESIGN");
        tnode(tid, null, "QA Docs");

        Long rt = tnode(tid, null, "RT");
        tnode(tid, rt, "LW");
        tnode(tid, rt, "SI");

        Long test = tnode(tid, null, "TEST");
        tnode(tid, test, "COMP");
        tnode(tid, test, "UAT");
        Long unit = tnode(tid, test, "UNIT");
        Long ib = tnode(tid, unit, "IB");
        tnode(tid, ib, "ASN");
        tnode(tid, ib, "SHIPMENTORDER");
        tnode(tid, ib, "SHIPTO");
        tnode(tid, ib, "SKU");
        Long ob = tnode(tid, unit, "OB");
        tnode(tid, ob, "INVENTORY BALANCE");
        tnode(tid, ob, "RECEIPT CONFIRMATION");

        tnode(tid, null, "XSLT");

        log.info("Seeded default directory template '{}' ({} folders)",
                template.getName(), templateNodeRepository.count());
    }

    private Long tnode(Long templateId, Long parentId, String name) {
        DirTemplateNode node = new DirTemplateNode();
        node.setTemplateId(templateId);
        node.setParentId(parentId);
        node.setName(name);
        int order = (int) templateNodeRepository.findByTemplateIdOrderByOrderIndexAsc(templateId).stream()
                .filter(n -> (parentId == null && n.getParentId() == null)
                        || (parentId != null && parentId.equals(n.getParentId())))
                .count();
        node.setOrderIndex(order);
        return templateNodeRepository.save(node).getId();
    }
}
