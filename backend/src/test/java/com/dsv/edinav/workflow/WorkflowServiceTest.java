package com.dsv.edinav.workflow;

import com.dsv.edinav.artifact.ArtifactRepository;
import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.workflow.dto.CreateVersionRequest;
import com.dsv.edinav.workflow.dto.ImportPhaseNode;
import com.dsv.edinav.workflow.dto.ImportStepNode;
import com.dsv.edinav.workflow.dto.ImportTransition;
import com.dsv.edinav.workflow.dto.ImportWorkflowRequest;
import com.dsv.edinav.workflow.dto.WorkflowDto;
import com.dsv.edinav.workflow.dto.WorkflowRequest;
import com.dsv.edinav.workflow.dto.WorkflowStepDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Behavioural safety net around the highest-risk WorkflowService paths (import/export/versioning/
 * update-from-import) — added before splitting that core further. Uses a real JPA slice + H2.
 */
@DataJpaTest
class WorkflowServiceTest {

    @Autowired private WorkflowRepository workflowRepository;
    @Autowired private WorkflowStepRepository stepRepository;
    @Autowired private WorkflowTransitionRepository transitionRepository;
    @Autowired private BusinessRoleRepository roleRepository;
    @Autowired private WorkflowPhaseRepository phaseRepository;
    @Autowired private WorkflowFolderRepository folderRepository;
    @Autowired private ArtifactRepository artifactRepository;

    private WorkflowService service;
    private WorkflowImportExportService importExport;

    @BeforeEach
    void setUp() {
        service = new WorkflowService(workflowRepository, stepRepository, transitionRepository,
                roleRepository, phaseRepository, folderRepository, artifactRepository);
        importExport = new WorkflowImportExportService(workflowRepository, stepRepository, transitionRepository,
                roleRepository, phaseRepository, artifactRepository, service);
    }

    /** A 3-step workflow: roots "Receive"(child "Log") and "Validate", edge Receive->Validate, phase "Intake". */
    private ImportWorkflowRequest sampleImport(String name) {
        ImportStepNode log = new ImportStepNode("c", null, "Log", null, null, "Ops", null, "p1", null);
        ImportStepNode receive = new ImportStepNode("a", null, "Receive", null, null, "Ops", null, "p1", List.of(log));
        ImportStepNode validate = new ImportStepNode("b", null, "Validate", null, null, null, List.of("QA"), "p1", null);
        return new ImportWorkflowRequest(
                name, "desc", "DRAFT", List.of("edi"),
                List.of(new ImportPhaseNode("p1", "Intake", "#123456", 0, null)),
                List.of(receive, validate),
                List.of(new ImportTransition("a", "b", "next")));
    }

    private WorkflowStepDto findByName(List<WorkflowStepDto> tree, String name) {
        for (WorkflowStepDto s : tree) {
            if (s.name().equals(name)) return s;
            WorkflowStepDto nested = findByName(s.children(), name);
            if (nested != null) return nested;
        }
        return null;
    }

    private List<Long> collectIds(List<WorkflowStepDto> tree, List<Long> acc) {
        for (WorkflowStepDto s : tree) {
            acc.add(s.id());
            collectIds(s.children(), acc);
        }
        return acc;
    }

    @Test
    void createWorkflow_rejectsDuplicateName() {
        service.createWorkflow(new WorkflowRequest("Dup", null, "DRAFT", null, null));
        assertThatThrownBy(() -> service.createWorkflow(new WorkflowRequest("dup", null, "DRAFT", null, null)))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void importThenExport_roundTripsStructure() {
        WorkflowDto imported = importExport.importWorkflow(sampleImport("RoundTrip"));
        assertThat(imported.stepCount()).isEqualTo(3);

        ImportWorkflowRequest out = importExport.exportWorkflow(imported.id(), true);
        assertThat(out.name()).isEqualTo("RoundTrip");
        assertThat(out.steps()).extracting(ImportStepNode::name)
                .containsExactly("Receive", "Validate");
        ImportStepNode receive = out.steps().get(0);
        assertThat(receive.children()).extracting(ImportStepNode::name).containsExactly("Log");
        assertThat(out.transitions()).hasSize(1);
        assertThat(out.transitions().get(0).label()).isEqualTo("next");
        assertThat(out.phases()).extracting(ImportPhaseNode::name).containsExactly("Intake");
    }

    @Test
    void getTree_nestsChildrenTransitionsAndRoles() {
        WorkflowDto imported = importExport.importWorkflow(sampleImport("Tree"));
        List<WorkflowStepDto> tree = service.getTree(imported.id());

        assertThat(tree).extracting(WorkflowStepDto::name).containsExactly("Receive", "Validate");
        WorkflowStepDto receive = findByName(tree, "Receive");
        assertThat(receive.children()).extracting(WorkflowStepDto::name).containsExactly("Log");
        assertThat(receive.businessRoles()).extracting(r -> r.name()).containsExactly("Ops");
        assertThat(receive.transitions()).hasSize(1);
        assertThat(receive.transitions().get(0).toStepName()).isEqualTo("Validate");
        assertThat(receive.phase().name()).isEqualTo("Intake");
    }

    @Test
    void createVersion_deepCopiesAsNonCurrentSibling() {
        WorkflowDto v1 = importExport.importWorkflow(sampleImport("Versioned"));
        WorkflowDto v2 = importExport.createVersion(v1.id(), new CreateVersionRequest("second"));

        assertThat(v2.groupId()).isEqualTo(v1.groupId());
        assertThat(v2.version()).isEqualTo(2);
        assertThat(v2.isCurrent()).isFalse();
        assertThat(v2.stepCount()).isEqualTo(3);
        // The copy is a distinct workflow with its own step rows.
        assertThat(v2.id()).isNotEqualTo(v1.id());
        assertThat(service.getVersions(v1.id())).hasSize(2);
    }

    @Test
    void setCurrent_movesTheFlagWithinTheGroup() {
        WorkflowDto v1 = importExport.importWorkflow(sampleImport("Flagged"));
        WorkflowDto v2 = importExport.createVersion(v1.id(), new CreateVersionRequest(null));

        service.setCurrent(v2.id());

        List<WorkflowDto> versions = service.getVersions(v1.id());
        assertThat(versions).filteredOn(WorkflowDto::isCurrent).extracting(WorkflowDto::id)
                .containsExactly(v2.id());
    }

    @Test
    void updateFromImport_withOwnSnapshot_preservesStepIds() {
        WorkflowDto imported = importExport.importWorkflow(sampleImport("Stable"));
        List<Long> before = collectIds(service.getTree(imported.id()), new ArrayList<>());

        // Re-importing the workflow's own export must match every step by ref and keep its id.
        importExport.updateWorkflowFromImport(imported.id(), importExport.exportWorkflow(imported.id(), true));

        List<Long> after = collectIds(service.getTree(imported.id()), new ArrayList<>());
        assertThat(after).containsExactlyInAnyOrderElementsOf(before);
    }
}
