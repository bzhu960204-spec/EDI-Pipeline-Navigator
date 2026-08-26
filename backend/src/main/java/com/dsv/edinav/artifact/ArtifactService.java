package com.dsv.edinav.artifact;

import com.dsv.edinav.artifact.dto.ArtifactChecklistItemDto;
import com.dsv.edinav.artifact.dto.ArtifactDetailDto;
import com.dsv.edinav.artifact.dto.ArtifactLogDto;
import com.dsv.edinav.artifact.dto.ArtifactNodeDto;
import com.dsv.edinav.artifact.dto.ArtifactSummaryDto;
import com.dsv.edinav.artifact.dto.ChecklistFolderDto;
import com.dsv.edinav.artifact.dto.ChecklistSummaryDto;
import com.dsv.edinav.artifact.dto.ChecklistViewDto;
import com.dsv.edinav.artifact.dto.CreateArtifactRequest;
import com.dsv.edinav.artifact.dto.CreateChecklistItemRequest;
import com.dsv.edinav.artifact.dto.CreateFolderRequest;
import com.dsv.edinav.artifact.dto.ImportAnalysisDto;
import com.dsv.edinav.artifact.dto.ImportNodeDto;
import com.dsv.edinav.artifact.dto.LogRequest;
import com.dsv.edinav.artifact.dto.StatusHistoryDto;
import com.dsv.edinav.artifact.dto.TemplateFolderDto;
import com.dsv.edinav.artifact.dto.UpdateChecklistItemRequest;
import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.storage.FileStorageService;
import com.dsv.edinav.storage.ImportStagingService;
import com.dsv.edinav.template.DirTemplateChecklistItem;
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
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class ArtifactService {

    private final ArtifactRepository artifactRepository;
    private final ArtifactNodeRepository nodeRepository;
    private final ArtifactChecklistItemRepository checklistRepository;
    private final StatusHistoryRepository historyRepository;
    private final ArtifactLogRepository logRepository;
    private final TemplateService templateService;
    private final FileStorageService storage;
    private final ImportStagingService importStaging;
    private final WorkflowStepRepository stepRepository;
    private final WorkflowRepository workflowRepository;
    private final UserRepository userRepository;

    public ArtifactService(ArtifactRepository artifactRepository,
                           ArtifactNodeRepository nodeRepository,
                           ArtifactChecklistItemRepository checklistRepository,
                           StatusHistoryRepository historyRepository,
                           ArtifactLogRepository logRepository,
                           TemplateService templateService,
                           FileStorageService storage,
                           ImportStagingService importStaging,
                           WorkflowStepRepository stepRepository,
                           WorkflowRepository workflowRepository,
                           UserRepository userRepository) {
        this.artifactRepository = artifactRepository;
        this.nodeRepository = nodeRepository;
        this.checklistRepository = checklistRepository;
        this.historyRepository = historyRepository;
        this.logRepository = logRepository;
        this.templateService = templateService;
        this.storage = storage;
        this.importStaging = importStaging;
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

        boolean hasImport = request.importToken() != null && !request.importToken().isBlank();
        // normalized folder path -> artifact folder node id (populated as folders are created)
        Map<String, Long> folderPathToNodeId = new java.util.HashMap<>();
        if (hasImport) {
            materializeImport(artifact.getId(), request.importToken(), folderPathToNodeId);
        }
        if (templateId != null) {
            instantiateTemplateOverlay(artifact.getId(), templateId, hasImport,
                    request.selectedTemplatePaths(), folderPathToNodeId);
        }
        if (hasImport) {
            importStaging.deleteToken(request.importToken());
        }
        return getDetail(ownerId, artifact.getId());
    }

    @Transactional(readOnly = true)
    public ImportAnalysisDto analyzeImport(Long ownerId, MultipartFile file, Long templateId) {
        String token = importStaging.stageZip(file);
        Path root = effectiveImportRoot(importStaging.resolveToken(token));
        int[] counts = new int[2];
        long[] bytes = new long[1];
        List<ImportNodeDto> tree = buildImportTree(root, "", counts, bytes);
        Set<String> importFolderPaths = new java.util.HashSet<>();
        collectImportFolderPaths(tree, importFolderPaths);
        List<TemplateFolderDto> templateFolders = List.of();
        Long resolved = templateService.resolveTemplateId(templateId);
        if (resolved != null) {
            templateFolders = buildTemplateFolderDtos(resolved, importFolderPaths);
        }
        return new ImportAnalysisDto(token, tree, templateFolders, counts[0], counts[1], bytes[0]);
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
        checklistRepository.deleteByArtifactId(id);
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
        cleanupChecklistForDeletedNodes(artifactId, toDelete);
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

    // ---------------- Checklist ----------------

    @Transactional(readOnly = true)
    public ChecklistViewDto getChecklist(Long ownerId, Long artifactId) {
        requireOwned(ownerId, artifactId);
        return buildChecklistView(artifactId);
    }

    @Transactional
    public ChecklistViewDto createChecklistItem(Long ownerId, Long artifactId, CreateChecklistItemRequest request) {
        Artifact artifact = requireOwned(ownerId, artifactId);
        validateFolder(artifactId, request.folderNodeId());
        if (request.label() == null || request.label().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Label is required");
        }
        ArtifactChecklistItem item = new ArtifactChecklistItem();
        item.setArtifactId(artifactId);
        item.setFolderNodeId(request.folderNodeId());
        item.setLabel(request.label().trim());
        item.setDescription(blankToNull(request.description()));
        item.setRequired(request.required());
        item.setOrderIndex(checklistRepository.nextOrderIndex(artifactId, request.folderNodeId()));
        checklistRepository.save(item);
        touch(artifact);
        return buildChecklistView(artifactId);
    }

    @Transactional
    public ChecklistViewDto updateChecklistItem(Long ownerId, Long artifactId, Long itemId,
                                                UpdateChecklistItemRequest request) {
        Artifact artifact = requireOwned(ownerId, artifactId);
        ArtifactChecklistItem item = requireChecklistItem(artifactId, itemId);
        if (request.label() == null || request.label().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Label is required");
        }
        item.setLabel(request.label().trim());
        item.setDescription(blankToNull(request.description()));
        item.setRequired(request.required());
        checklistRepository.save(item);
        touch(artifact);
        return buildChecklistView(artifactId);
    }

    @Transactional
    public ChecklistViewDto assignChecklistItem(Long ownerId, Long artifactId, Long itemId, Long nodeId) {
        Artifact artifact = requireOwned(ownerId, artifactId);
        ArtifactChecklistItem item = requireChecklistItem(artifactId, itemId);
        if (nodeId == null) {
            item.setSatisfiedByNodeId(null);
        } else {
            ArtifactNode file = requireNode(artifactId, nodeId);
            if (file.isFolder()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Only a file can fulfil a checklist item");
            }
            if (!java.util.Objects.equals(file.getParentId(), item.getFolderNodeId())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "File must be in the checklist item's folder");
            }
            item.setSatisfiedByNodeId(nodeId);
        }
        checklistRepository.save(item);
        touch(artifact);
        return buildChecklistView(artifactId);
    }

    @Transactional
    public ChecklistViewDto deleteChecklistItem(Long ownerId, Long artifactId, Long itemId) {
        Artifact artifact = requireOwned(ownerId, artifactId);
        ArtifactChecklistItem item = requireChecklistItem(artifactId, itemId);
        checklistRepository.delete(item);
        touch(artifact);
        return buildChecklistView(artifactId);
    }

    private ChecklistViewDto buildChecklistView(Long artifactId) {
        List<ArtifactNode> nodes = nodeRepository.findByArtifactIdOrderByOrderIndexAsc(artifactId);
        Map<Long, ArtifactNode> byId = nodes.stream()
                .collect(Collectors.toMap(ArtifactNode::getId, n -> n));
        List<ArtifactChecklistItem> items = checklistRepository.findByArtifactIdOrderByOrderIndexAsc(artifactId);
        Map<Long, List<ArtifactChecklistItem>> byFolder = items.stream()
                .collect(Collectors.groupingBy(i -> i.getFolderNodeId() == null ? 0L : i.getFolderNodeId()));

        List<Long> folderKeys = new ArrayList<>(byFolder.keySet());
        folderKeys.sort(Comparator.comparing(k -> k == 0L ? "" : nodePath(byId, k).toLowerCase()));

        List<ChecklistFolderDto> folders = new ArrayList<>();
        int mandTotal = 0, mandSat = 0, optTotal = 0, optSat = 0;
        for (Long key : folderKeys) {
            Long folderNodeId = key == 0L ? null : key;
            ArtifactNode folderNode = folderNodeId == null ? null : byId.get(folderNodeId);
            String folderName = folderNode == null ? "(Root)" : folderNode.getName();
            String path = folderNode == null ? "" : nodePath(byId, folderNodeId);
            List<ArtifactChecklistItemDto> itemDtos = new ArrayList<>();
            int fMandTotal = 0, fMandSat = 0, fOptTotal = 0, fOptSat = 0;
            for (ArtifactChecklistItem item : byFolder.get(key)) {
                boolean satisfied = isSatisfied(item, byId);
                Long satNode = satisfied ? item.getSatisfiedByNodeId() : null;
                String satName = satNode != null && byId.containsKey(satNode) ? byId.get(satNode).getName() : null;
                itemDtos.add(new ArtifactChecklistItemDto(item.getId(), item.getFolderNodeId(), item.getLabel(),
                        item.getDescription(), item.isRequired(), satisfied, satNode, satName));
                if (item.isRequired()) {
                    fMandTotal++;
                    if (satisfied) fMandSat++;
                } else {
                    fOptTotal++;
                    if (satisfied) fOptSat++;
                }
            }
            mandTotal += fMandTotal;
            mandSat += fMandSat;
            optTotal += fOptTotal;
            optSat += fOptSat;
            folders.add(new ChecklistFolderDto(folderNodeId, folderName, path,
                    fMandTotal, fMandSat, fOptTotal, fOptSat, itemDtos));
        }
        boolean complete = mandSat == mandTotal;
        return new ChecklistViewDto(new ChecklistSummaryDto(mandTotal, mandSat, optTotal, optSat, complete), folders);
    }

    private boolean isSatisfied(ArtifactChecklistItem item, Map<Long, ArtifactNode> byId) {
        Long nodeId = item.getSatisfiedByNodeId();
        if (nodeId == null) {
            return false;
        }
        ArtifactNode node = byId.get(nodeId);
        return node != null && !node.isFolder();
    }

    private String nodePath(Map<Long, ArtifactNode> byId, Long nodeId) {
        java.util.LinkedList<String> parts = new java.util.LinkedList<>();
        ArtifactNode cur = byId.get(nodeId);
        while (cur != null) {
            parts.addFirst(cur.getName());
            cur = cur.getParentId() == null ? null : byId.get(cur.getParentId());
        }
        return String.join("/", parts);
    }

    private void cleanupChecklistForDeletedNodes(Long artifactId, List<ArtifactNode> deleted) {
        java.util.Set<Long> deletedIds = deleted.stream()
                .map(ArtifactNode::getId)
                .collect(Collectors.toSet());
        List<ArtifactChecklistItem> items = checklistRepository.findByArtifactIdOrderByOrderIndexAsc(artifactId);
        List<ArtifactChecklistItem> toRemove = new ArrayList<>();
        for (ArtifactChecklistItem item : items) {
            if (item.getFolderNodeId() != null && deletedIds.contains(item.getFolderNodeId())) {
                toRemove.add(item);
            } else if (item.getSatisfiedByNodeId() != null && deletedIds.contains(item.getSatisfiedByNodeId())) {
                item.setSatisfiedByNodeId(null);
                checklistRepository.save(item);
            }
        }
        if (!toRemove.isEmpty()) {
            checklistRepository.deleteAll(toRemove);
        }
    }

    private void validateFolder(Long artifactId, Long folderNodeId) {
        if (folderNodeId == null) {
            return;
        }
        ArtifactNode folder = requireNode(artifactId, folderNodeId);
        if (!folder.isFolder()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Checklist can only attach to a folder");
        }
    }

    private ArtifactChecklistItem requireChecklistItem(Long artifactId, Long itemId) {
        ArtifactChecklistItem item = checklistRepository.findById(itemId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Checklist item not found"));
        if (!item.getArtifactId().equals(artifactId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Checklist item does not belong to this artifact");
        }
        return item;
    }

    private String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.strip();
        return trimmed.isBlank() ? null : trimmed;
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

    /** Materialises a staged import tree into artifact nodes, recording folder paths for template overlay. */
    private void materializeImport(Long artifactId, String token, Map<String, Long> folderPathToNodeId) {
        Path root = effectiveImportRoot(importStaging.resolveToken(token));
        createImportChildren(artifactId, root, null, "", folderPathToNodeId);
    }

    /**
     * When an archive wraps everything in a single top-level directory (the common case when a
     * project folder is zipped), treat that directory's contents as the root so import paths line
     * up with template paths, which have no such wrapper.
     */
    private Path effectiveImportRoot(Path root) {
        List<Path> entries = listSorted(root);
        if (entries.size() == 1 && Files.isDirectory(entries.get(0))) {
            return entries.get(0);
        }
        return root;
    }

    private void createImportChildren(Long artifactId, Path dir, Long parentId, String parentPath,
                                      Map<String, Long> folderPathToNodeId) {
        List<Path> entries = listSorted(dir);
        for (Path entry : entries) {
            String name = clampName(entry.getFileName().toString());
            String childPath = parentPath.isEmpty() ? name : parentPath + "/" + name;
            boolean folder = Files.isDirectory(entry);
            ArtifactNode node = new ArtifactNode();
            node.setArtifactId(artifactId);
            node.setParentId(parentId);
            node.setName(name);
            node.setFolder(folder);
            node.setOrderIndex(nodeRepository.nextOrderIndex(artifactId, parentId));
            if (folder) {
                nodeRepository.save(node);
                folderPathToNodeId.put(normalizePath(childPath), node.getId());
                createImportChildren(artifactId, entry, node.getId(), childPath, folderPathToNodeId);
            } else {
                String stored = storage.storeFromPath(artifactId, entry, name);
                node.setStoredPath(stored);
                node.setSizeBytes(fileSize(entry));
                node.setContentType(probeContentType(entry));
                nodeRepository.save(node);
            }
        }
    }

    /** Builds the artifact tree from a template, only creating selected folders when an import is present. */
    private void instantiateTemplateOverlay(Long artifactId, Long templateId, boolean hasImport,
                                            List<String> selectedTemplatePaths,
                                            Map<String, Long> folderPathToNodeId) {
        List<DirTemplateNode> templateNodes = templateService.getNodes(templateId);
        Map<Long, DirTemplateNode> byId = templateNodes.stream()
                .collect(Collectors.toMap(DirTemplateNode::getId, n -> n));
        // template node id -> normalized full path
        Map<Long, String> templatePath = new java.util.HashMap<>();
        for (DirTemplateNode tn : templateNodes) {
            templatePath.put(tn.getId(), normalizePath(templateFullPath(tn, byId)));
        }

        Set<String> wanted = null;
        if (hasImport) {
            wanted = new java.util.HashSet<>();
            if (selectedTemplatePaths != null) {
                for (String p : selectedTemplatePaths) {
                    String norm = normalizePath(p);
                    if (norm.isEmpty()) {
                        continue;
                    }
                    wanted.add(norm);
                    // ensure ancestors are created so the branch stays connected
                    int slash = norm.lastIndexOf('/');
                    while (slash > 0) {
                        norm = norm.substring(0, slash);
                        wanted.add(norm);
                        slash = norm.lastIndexOf('/');
                    }
                }
            }
        }

        List<DirTemplateNode> ordered = templateNodes.stream()
                .sorted(Comparator.comparingInt((DirTemplateNode n) -> depthOf(templatePath.get(n.getId())))
                        .thenComparingInt(DirTemplateNode::getOrderIndex))
                .toList();
        for (DirTemplateNode tn : ordered) {
            String path = templatePath.get(tn.getId());
            if (folderPathToNodeId.containsKey(path)) {
                continue; // already present from the import
            }
            if (hasImport && !wanted.contains(path)) {
                continue; // not selected by the user
            }
            Long parentNodeId = null;
            if (tn.getParentId() != null) {
                parentNodeId = folderPathToNodeId.get(templatePath.get(tn.getParentId()));
            }
            ArtifactNode node = new ArtifactNode();
            node.setArtifactId(artifactId);
            node.setParentId(parentNodeId);
            node.setName(tn.getName());
            node.setFolder(true);
            node.setOrderIndex(nodeRepository.nextOrderIndex(artifactId, parentNodeId));
            nodeRepository.save(node);
            folderPathToNodeId.put(path, node.getId());
        }
        instantiateTemplateChecklist(artifactId, templateId, templatePath, folderPathToNodeId);
    }

    private void instantiateTemplateChecklist(Long artifactId, Long templateId,
                                              Map<Long, String> templatePath,
                                              Map<String, Long> folderPathToNodeId) {
        List<DirTemplateChecklistItem> templateItems = templateService.getChecklistItems(templateId);
        int order = 0;
        for (DirTemplateChecklistItem ti : templateItems) {
            Long folderNodeId;
            if (ti.getTemplateNodeId() == null) {
                folderNodeId = null; // attached to the artifact root
            } else {
                String path = templatePath.get(ti.getTemplateNodeId());
                folderNodeId = path == null ? null : folderPathToNodeId.get(path);
                if (folderNodeId == null) {
                    continue; // owning folder was not created
                }
            }
            ArtifactChecklistItem item = new ArtifactChecklistItem();
            item.setArtifactId(artifactId);
            item.setFolderNodeId(folderNodeId);
            item.setLabel(ti.getLabel());
            item.setDescription(ti.getDescription());
            item.setRequired(ti.isRequired());
            item.setOrderIndex(order++);
            checklistRepository.save(item);
        }
    }

    // ---------------- Import analysis helpers ----------------

    private List<ImportNodeDto> buildImportTree(Path dir, String parentPath, int[] counts, long[] bytes) {
        List<ImportNodeDto> result = new ArrayList<>();
        for (Path entry : listSorted(dir)) {
            String name = clampName(entry.getFileName().toString());
            String childPath = parentPath.isEmpty() ? name : parentPath + "/" + name;
            if (Files.isDirectory(entry)) {
                counts[1]++;
                List<ImportNodeDto> children = buildImportTree(entry, childPath, counts, bytes);
                result.add(new ImportNodeDto(name, childPath, true, 0, children));
            } else {
                counts[0]++;
                long size = fileSize(entry);
                bytes[0] += size;
                result.add(new ImportNodeDto(name, childPath, false, size, List.of()));
            }
        }
        return result;
    }

    private void collectImportFolderPaths(List<ImportNodeDto> nodes, Set<String> acc) {
        for (ImportNodeDto node : nodes) {
            if (node.folder()) {
                acc.add(normalizePath(node.path()));
                collectImportFolderPaths(node.children(), acc);
            }
        }
    }

    private List<TemplateFolderDto> buildTemplateFolderDtos(Long templateId, Set<String> importFolderPaths) {
        List<DirTemplateNode> templateNodes = templateService.getNodes(templateId);
        Map<Long, DirTemplateNode> byId = templateNodes.stream()
                .collect(Collectors.toMap(DirTemplateNode::getId, n -> n));
        return templateNodes.stream()
                .map(tn -> {
                    String path = templateFullPath(tn, byId);
                    boolean present = importFolderPaths.contains(normalizePath(path));
                    return new TemplateFolderDto(path, tn.getName(), depthOf(normalizePath(path)), present);
                })
                .sorted(Comparator.comparing(TemplateFolderDto::path, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private String templateFullPath(DirTemplateNode node, Map<Long, DirTemplateNode> byId) {
        List<String> segments = new ArrayList<>();
        DirTemplateNode current = node;
        int guard = 0;
        while (current != null && guard++ < 100) {
            segments.add(0, current.getName());
            current = current.getParentId() == null ? null : byId.get(current.getParentId());
        }
        return String.join("/", segments);
    }

    private List<Path> listSorted(Path dir) {
        try (Stream<Path> stream = Files.list(dir)) {
            return stream.sorted(Comparator
                            .comparing((Path p) -> Files.isDirectory(p) ? 0 : 1)
                            .thenComparing(p -> p.getFileName().toString(), String.CASE_INSENSITIVE_ORDER))
                    .toList();
        } catch (IOException e) {
            return List.of();
        }
    }

    private long fileSize(Path entry) {
        try {
            return Files.size(entry);
        } catch (IOException e) {
            return 0;
        }
    }

    private String probeContentType(Path entry) {
        try {
            return Files.probeContentType(entry);
        } catch (IOException e) {
            return null;
        }
    }

    private String clampName(String name) {
        return name.length() > 260 ? name.substring(0, 260) : name;
    }

    /** Normalises a folder path for case-insensitive matching between import and template. */
    private String normalizePath(String path) {
        if (path == null) {
            return "";
        }
        String normalised = path.replace('\\', '/').trim();
        String[] segments = normalised.split("/");
        StringBuilder sb = new StringBuilder();
        for (String segment : segments) {
            String s = segment.trim();
            if (s.isEmpty()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append('/');
            }
            sb.append(s.toLowerCase());
        }
        return sb.toString();
    }

    private int depthOf(String normalizedPath) {
        if (normalizedPath == null || normalizedPath.isEmpty()) {
            return 0;
        }
        return (int) normalizedPath.chars().filter(c -> c == '/').count() + 1;
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
