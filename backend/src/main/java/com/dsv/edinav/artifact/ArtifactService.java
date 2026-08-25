package com.dsv.edinav.artifact;

import com.dsv.edinav.artifact.dto.ArtifactDetailDto;
import com.dsv.edinav.artifact.dto.ArtifactLogDto;
import com.dsv.edinav.artifact.dto.ArtifactNodeDto;
import com.dsv.edinav.artifact.dto.ArtifactSummaryDto;
import com.dsv.edinav.artifact.dto.CreateArtifactRequest;
import com.dsv.edinav.artifact.dto.CreateFolderRequest;
import com.dsv.edinav.artifact.dto.LogRequest;
import com.dsv.edinav.artifact.dto.StatusHistoryDto;
import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.storage.FileStorageService;
import com.dsv.edinav.template.DirTemplateNode;
import com.dsv.edinav.template.TemplateService;
import com.dsv.edinav.user.User;
import com.dsv.edinav.user.UserRepository;
import com.dsv.edinav.workflow.Workflow;
import com.dsv.edinav.workflow.WorkflowRepository;
import com.dsv.edinav.workflow.WorkflowStep;
import com.dsv.edinav.workflow.WorkflowStepRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.OutputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class ArtifactService {

    private final ArtifactRepository artifactRepository;
    private final ArtifactNodeRepository nodeRepository;
    private final StatusHistoryRepository historyRepository;
    private final ArtifactLogRepository logRepository;
    private final TemplateService templateService;
    private final FileStorageService storage;
    private final WorkflowStepRepository stepRepository;
    private final WorkflowRepository workflowRepository;
    private final UserRepository userRepository;

    public ArtifactService(ArtifactRepository artifactRepository,
                           ArtifactNodeRepository nodeRepository,
                           StatusHistoryRepository historyRepository,
                           ArtifactLogRepository logRepository,
                           TemplateService templateService,
                           FileStorageService storage,
                           WorkflowStepRepository stepRepository,
                           WorkflowRepository workflowRepository,
                           UserRepository userRepository) {
        this.artifactRepository = artifactRepository;
        this.nodeRepository = nodeRepository;
        this.historyRepository = historyRepository;
        this.logRepository = logRepository;
        this.templateService = templateService;
        this.storage = storage;
        this.stepRepository = stepRepository;
        this.workflowRepository = workflowRepository;
        this.userRepository = userRepository;
    }

    // ---------------- Artifacts ----------------

    @Transactional(readOnly = true)
    public List<ArtifactSummaryDto> listMine(Long ownerId) {
        Map<Long, String> stepNames = stepNameMap();
        return artifactRepository.findByOwnerIdOrderByUpdatedAtDesc(ownerId).stream()
                .map(a -> toSummary(a, stepNames))
                .toList();
    }

    @Transactional
    public ArtifactDetailDto create(Long ownerId, CreateArtifactRequest request) {
        Long templateId = templateService.resolveTemplateId(request.templateId());
        Artifact artifact = new Artifact();
        artifact.setOwnerId(ownerId);
        artifact.setName(request.name().trim());
        artifact.setEdiRef(request.ediRef() == null ? null : request.ediRef().trim());
        artifact.setTemplateId(templateId);
        artifactRepository.save(artifact);

        if (templateId != null) {
            instantiateTemplate(artifact.getId(), templateId);
        }
        return getDetail(ownerId, artifact.getId());
    }

    @Transactional(readOnly = true)
    public ArtifactDetailDto getDetail(Long ownerId, Long id) {
        Artifact artifact = requireOwned(ownerId, id);
        return new ArtifactDetailDto(artifact.getId(), artifact.getName(), artifact.getEdiRef(),
                artifact.getCurrentStepId(), stepName(artifact.getCurrentStepId()),
                artifact.getTemplateId(), artifact.getCreatedAt(), artifact.getUpdatedAt(),
                buildNodeTree(id));
    }

    @Transactional
    public void delete(Long ownerId, Long id) {
        requireOwned(ownerId, id);
        historyRepository.deleteByArtifactId(id);
        logRepository.deleteByArtifactId(id);
        nodeRepository.deleteByArtifactId(id);
        artifactRepository.deleteById(id);
        storage.deleteArtifactDirectory(id);
    }

    // ---------------- Logs ----------------

    @Transactional(readOnly = true)
    public List<ArtifactLogDto> listLogs(Long ownerId, Long artifactId) {
        requireOwned(ownerId, artifactId);
        return logRepository.findByArtifactIdOrderByCreatedAtAsc(artifactId).stream()
                .map(this::toLogDto)
                .toList();
    }

    @Transactional
    public ArtifactLogDto createLog(Long ownerId, Long artifactId, LogRequest request) {
        requireOwned(ownerId, artifactId);
        if (request.title() == null || request.title().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Title is required");
        }
        ArtifactLog log = new ArtifactLog();
        log.setArtifactId(artifactId);
        log.setTitle(request.title().trim());
        log.setContent(request.content() == null ? "" : request.content());
        logRepository.save(log);
        return toLogDto(log);
    }

    @Transactional
    public ArtifactLogDto updateLog(Long ownerId, Long artifactId, Long logId, LogRequest request) {
        requireOwned(ownerId, artifactId);
        ArtifactLog log = requireLog(artifactId, logId);
        if (request.title() != null && !request.title().isBlank()) {
            log.setTitle(request.title().trim());
        }
        if (request.content() != null) {
            log.setContent(request.content());
        }
        logRepository.save(log);
        return toLogDto(log);
    }

    @Transactional
    public void deleteLog(Long ownerId, Long artifactId, Long logId) {
        requireOwned(ownerId, artifactId);
        ArtifactLog log = requireLog(artifactId, logId);
        logRepository.delete(log);
    }

    private ArtifactLog requireLog(Long artifactId, Long logId) {
        ArtifactLog log = logRepository.findById(logId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Log not found"));
        if (!log.getArtifactId().equals(artifactId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Log does not belong to this artifact");
        }
        return log;
    }

    private ArtifactLogDto toLogDto(ArtifactLog log) {
        return new ArtifactLogDto(log.getId(), log.getTitle(), log.getContent(),
                log.getCreatedAt(), log.getUpdatedAt());
    }

    // ---------------- Nodes ----------------

    @Transactional
    public ArtifactNodeDto createFolder(Long ownerId, Long artifactId, CreateFolderRequest request) {
        Artifact artifact = requireOwned(ownerId, artifactId);
        validateParent(artifactId, request.parentId());
        ArtifactNode node = new ArtifactNode();
        node.setArtifactId(artifactId);
        node.setParentId(request.parentId());
        node.setName(request.name().trim());
        node.setFolder(true);
        node.setOrderIndex(nodeRepository.nextOrderIndex(artifactId, request.parentId()));
        nodeRepository.save(node);
        touch(artifact);
        return toNodeDto(node, List.of());
    }

    @Transactional
    public void uploadFiles(Long ownerId, Long artifactId, Long folderId, MultipartFile[] files) {
        Artifact artifact = requireOwned(ownerId, artifactId);
        if (folderId != null) {
            ArtifactNode folder = requireNode(artifactId, folderId);
            if (!folder.isFolder()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Target is not a folder");
            }
        }
        if (files == null || files.length == 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No files provided");
        }
        for (MultipartFile file : files) {
            if (file.isEmpty()) {
                continue;
            }
            String stored = storage.store(artifactId, file);
            ArtifactNode node = new ArtifactNode();
            node.setArtifactId(artifactId);
            node.setParentId(folderId);
            node.setName(cleanFileName(file.getOriginalFilename()));
            node.setFolder(false);
            node.setStoredPath(stored);
            node.setSizeBytes(file.getSize());
            node.setContentType(file.getContentType());
            node.setOrderIndex(nodeRepository.nextOrderIndex(artifactId, folderId));
            nodeRepository.save(node);
        }
        touch(artifact);
    }

    @Transactional(readOnly = true)
    public ArtifactNode getDownloadNode(Long ownerId, Long artifactId, Long nodeId) {
        requireOwned(ownerId, artifactId);
        ArtifactNode node = requireNode(artifactId, nodeId);
        if (node.isFolder()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot download a folder directly");
        }
        return node;
    }

    @Transactional(readOnly = true)
    public java.io.InputStream openFile(Long ownerId, Long artifactId, Long nodeId) {
        ArtifactNode node = getDownloadNode(ownerId, artifactId, nodeId);
        if (node.getStoredPath() == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "File has no stored content");
        }
        return storage.openStream(node.getStoredPath());
    }

    @Transactional
    public void deleteNode(Long ownerId, Long artifactId, Long nodeId) {
        Artifact artifact = requireOwned(ownerId, artifactId);
        ArtifactNode node = requireNode(artifactId, nodeId);
        List<ArtifactNode> all = nodeRepository.findByArtifactIdOrderByOrderIndexAsc(artifactId);
        Map<Long, List<ArtifactNode>> byParent = all.stream()
                .collect(Collectors.groupingBy(n -> n.getParentId() == null ? 0L : n.getParentId()));
        List<ArtifactNode> toDelete = new ArrayList<>();
        collectSubtree(node, byParent, toDelete);
        toDelete.stream().filter(n -> !n.isFolder()).forEach(n -> storage.delete(n.getStoredPath()));
        nodeRepository.deleteAll(toDelete);
        touch(artifact);
    }

    @Transactional
    public ArtifactDetailDto renameNode(Long ownerId, Long artifactId, Long nodeId, String rawName) {
        Artifact artifact = requireOwned(ownerId, artifactId);
        ArtifactNode node = requireNode(artifactId, nodeId);
        String desired = cleanNodeName(rawName);
        if (desired.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        node.setName(uniqueName(artifactId, node.getParentId(), desired, node.getId()));
        nodeRepository.save(node);
        touch(artifact);
        return getDetail(ownerId, artifactId);
    }

    @Transactional
    public ArtifactDetailDto updateNotes(Long ownerId, Long artifactId, Long nodeId, String notes) {
        Artifact artifact = requireOwned(ownerId, artifactId);
        ArtifactNode node = requireNode(artifactId, nodeId);
        String trimmed = notes == null ? null : notes.strip();
        node.setNotes(trimmed == null || trimmed.isBlank() ? null : trimmed);
        nodeRepository.save(node);
        touch(artifact);
        return getDetail(ownerId, artifactId);
    }

    @Transactional
    public ArtifactDetailDto moveNode(Long ownerId, Long artifactId, Long nodeId, Long targetParentId) {
        Artifact artifact = requireOwned(ownerId, artifactId);
        ArtifactNode node = requireNode(artifactId, nodeId);
        validateParent(artifactId, targetParentId);
        if (java.util.Objects.equals(node.getParentId(), targetParentId)) {
            return getDetail(ownerId, artifactId);
        }
        if (node.isFolder() && isDescendantOrSelf(targetParentId, node.getId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot move a folder into itself or one of its subfolders");
        }
        node.setParentId(targetParentId);
        node.setName(uniqueName(artifactId, targetParentId, node.getName(), node.getId()));
        node.setOrderIndex(nodeRepository.nextOrderIndex(artifactId, targetParentId));
        nodeRepository.save(node);
        touch(artifact);
        return getDetail(ownerId, artifactId);
    }

    // ---------------- Export ----------------

    @Transactional(readOnly = true)
    public void exportZip(Long ownerId, Long artifactId, OutputStream out) {
        requireOwned(ownerId, artifactId);
        List<ArtifactNode> all = nodeRepository.findByArtifactIdOrderByOrderIndexAsc(artifactId);
        Map<Long, List<ArtifactNode>> byParent = all.stream()
                .collect(Collectors.groupingBy(n -> n.getParentId() == null ? 0L : n.getParentId()));
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            writeZipEntries(zip, 0L, "", byParent);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to build archive: " + e.getMessage());
        }
    }

    private void writeZipEntries(ZipOutputStream zip, Long parentKey, String prefix,
                                 Map<Long, List<ArtifactNode>> byParent) throws IOException {
        List<ArtifactNode> children = byParent.getOrDefault(parentKey, List.of()).stream()
                .sorted(Comparator.comparingInt(ArtifactNode::getOrderIndex))
                .toList();
        for (ArtifactNode node : children) {
            if (node.isFolder()) {
                String dirPath = prefix + node.getName() + "/";
                zip.putNextEntry(new ZipEntry(dirPath));
                zip.closeEntry();
                writeZipEntries(zip, node.getId(), dirPath, byParent);
            } else {
                zip.putNextEntry(new ZipEntry(prefix + node.getName()));
                if (node.getStoredPath() != null) {
                    try (var in = storage.openStream(node.getStoredPath())) {
                        in.transferTo(zip);
                    }
                }
                zip.closeEntry();
            }
        }
    }

    // ---------------- Status / history ----------------

    @Transactional
    public ArtifactDetailDto advance(Long ownerId, Long artifactId, Long toStepId, String comment) {
        Artifact artifact = requireOwned(ownerId, artifactId);
        WorkflowStep target = stepRepository.findById(toStepId)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Target step not found"));
        Workflow workflow = workflowRepository.findById(target.getWorkflowId())
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Target step not found"));
        if (!ownerId.equals(workflow.getOwnerId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Target step not found");
        }
        StatusHistory history = new StatusHistory();
        history.setArtifactId(artifactId);
        history.setFromStepId(artifact.getCurrentStepId());
        history.setToStepId(toStepId);
        history.setChangedBy(ownerId);
        history.setComment(comment);
        historyRepository.save(history);

        artifact.setCurrentStepId(toStepId);
        touch(artifact);
        return getDetail(ownerId, artifactId);
    }

    @Transactional(readOnly = true)
    public List<StatusHistoryDto> getHistory(Long ownerId, Long artifactId) {
        requireOwned(ownerId, artifactId);
        Map<Long, String> stepNames = stepNameMap();
        Map<Long, String> userNames = userRepository.findAll().stream()
                .collect(Collectors.toMap(User::getId, User::getDisplayName));
        return historyRepository.findByArtifactIdOrderByChangedAtDesc(artifactId).stream()
                .map(h -> new StatusHistoryDto(h.getId(),
                        h.getFromStepId(), h.getFromStepId() == null ? null : stepNames.get(h.getFromStepId()),
                        h.getToStepId(), h.getToStepId() == null ? null : stepNames.get(h.getToStepId()),
                        h.getChangedBy(), userNames.get(h.getChangedBy()), h.getComment(), h.getChangedAt()))
                .toList();
    }

    // ---------------- Helpers ----------------

    private void instantiateTemplate(Long artifactId, Long templateId) {
        List<DirTemplateNode> templateNodes = templateService.getNodes(templateId);
        Map<Long, List<DirTemplateNode>> byParent = templateNodes.stream()
                .collect(Collectors.groupingBy(n -> n.getParentId() == null ? 0L : n.getParentId()));
        createTemplateChildren(artifactId, 0L, null, byParent);
    }

    private void createTemplateChildren(Long artifactId, Long templateParentKey, Long artifactParentId,
                                        Map<Long, List<DirTemplateNode>> byParent) {
        List<DirTemplateNode> children = byParent.getOrDefault(templateParentKey, List.of()).stream()
                .sorted(Comparator.comparingInt(DirTemplateNode::getOrderIndex))
                .toList();
        int order = 0;
        for (DirTemplateNode tn : children) {
            ArtifactNode node = new ArtifactNode();
            node.setArtifactId(artifactId);
            node.setParentId(artifactParentId);
            node.setName(tn.getName());
            node.setFolder(true);
            node.setOrderIndex(order++);
            nodeRepository.save(node);
            createTemplateChildren(artifactId, tn.getId(), node.getId(), byParent);
        }
    }

    private void collectSubtree(ArtifactNode node, Map<Long, List<ArtifactNode>> byParent, List<ArtifactNode> acc) {
        acc.add(node);
        for (ArtifactNode child : byParent.getOrDefault(node.getId(), List.of())) {
            collectSubtree(child, byParent, acc);
        }
    }

    private List<ArtifactNodeDto> buildNodeTree(Long artifactId) {
        List<ArtifactNode> nodes = nodeRepository.findByArtifactIdOrderByOrderIndexAsc(artifactId);
        Map<Long, List<ArtifactNode>> byParent = nodes.stream()
                .collect(Collectors.groupingBy(n -> n.getParentId() == null ? 0L : n.getParentId()));
        return buildChildren(0L, byParent);
    }

    private List<ArtifactNodeDto> buildChildren(Long parentKey, Map<Long, List<ArtifactNode>> byParent) {
        List<ArtifactNodeDto> out = new ArrayList<>();
        byParent.getOrDefault(parentKey, List.of()).stream()
                // Folders first, then files; each group by order index.
                .sorted(Comparator.comparing(ArtifactNode::isFolder).reversed()
                        .thenComparingInt(ArtifactNode::getOrderIndex))
                .forEach(n -> out.add(toNodeDto(n, buildChildren(n.getId(), byParent))));
        return out;
    }

    private ArtifactNodeDto toNodeDto(ArtifactNode node, List<ArtifactNodeDto> children) {
        return new ArtifactNodeDto(node.getId(), node.getParentId(), node.getName(), node.isFolder(),
                node.getSizeBytes(), node.getContentType(), node.getNotes(), node.getCreatedAt(), children);
    }

    private ArtifactSummaryDto toSummary(Artifact a, Map<Long, String> stepNames) {
        int fileCount = (int) nodeRepository.findByArtifactIdOrderByOrderIndexAsc(a.getId()).stream()
                .filter(n -> !n.isFolder()).count();
        return new ArtifactSummaryDto(a.getId(), a.getName(), a.getEdiRef(), a.getCurrentStepId(),
                a.getCurrentStepId() == null ? null : stepNames.get(a.getCurrentStepId()),
                a.getTemplateId(), fileCount, a.getCreatedAt(), a.getUpdatedAt());
    }

    private Artifact requireOwned(Long ownerId, Long id) {
        Artifact artifact = artifactRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Artifact not found"));
        if (!artifact.getOwnerId().equals(ownerId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "You do not own this artifact");
        }
        return artifact;
    }

    private ArtifactNode requireNode(Long artifactId, Long nodeId) {
        ArtifactNode node = nodeRepository.findById(nodeId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Node not found"));
        if (!node.getArtifactId().equals(artifactId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Node does not belong to this artifact");
        }
        return node;
    }

    private void validateParent(Long artifactId, Long parentId) {
        if (parentId == null) {
            return;
        }
        ArtifactNode parent = requireNode(artifactId, parentId);
        if (!parent.isFolder()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Parent must be a folder");
        }
    }

    private void touch(Artifact artifact) {
        artifact.setUpdatedAt(Instant.now());
        artifactRepository.save(artifact);
    }

    private Map<Long, String> stepNameMap() {
        return stepRepository.findAll().stream()
                .collect(Collectors.toMap(WorkflowStep::getId, WorkflowStep::getName));
    }

    private String stepName(Long stepId) {
        if (stepId == null) {
            return null;
        }
        return stepRepository.findById(stepId).map(WorkflowStep::getName).orElse(null);
    }

    private String cleanFileName(String original) {
        if (original == null || original.isBlank()) {
            return "file";
        }
        String name = original.replace('\\', '/');
        int slash = name.lastIndexOf('/');
        return slash >= 0 ? name.substring(slash + 1) : name;
    }

    /** Strips path separators and trims a user-supplied node name. */
    private String cleanNodeName(String raw) {
        if (raw == null) {
            return "";
        }
        String name = raw.trim().replaceAll("[\\\\/]", "_");
        return name.length() > 260 ? name.substring(0, 260) : name;
    }

    /** Returns true if {@code candidateParentId} is the folder itself or nested under it. */
    private boolean isDescendantOrSelf(Long candidateParentId, Long folderId) {
        Long cur = candidateParentId;
        while (cur != null) {
            if (cur.equals(folderId)) {
                return true;
            }
            ArtifactNode n = nodeRepository.findById(cur).orElse(null);
            cur = n == null ? null : n.getParentId();
        }
        return false;
    }

    /** Ensures the name is unique within its parent folder, appending " (n)" before the extension if needed. */
    private String uniqueName(Long artifactId, Long parentId, String desired, Long excludeNodeId) {
        java.util.Set<String> taken = nodeRepository.findByParentIdOrderByOrderIndexAsc(parentId).stream()
                .filter(n -> artifactId.equals(n.getArtifactId()))
                .filter(n -> !n.getId().equals(excludeNodeId))
                .map(n -> n.getName().toLowerCase())
                .collect(Collectors.toSet());
        if (!taken.contains(desired.toLowerCase())) {
            return desired;
        }
        String base = desired;
        String ext = "";
        int dot = desired.lastIndexOf('.');
        if (dot > 0) {
            base = desired.substring(0, dot);
            ext = desired.substring(dot);
        }
        int i = 1;
        String candidate;
        do {
            candidate = base + " (" + i + ")" + ext;
            i++;
        } while (taken.contains(candidate.toLowerCase()));
        return candidate;
    }
}
