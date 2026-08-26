package com.dsv.edinav.storage;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.config.AppProperties;
import jakarta.annotation.PostConstruct;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

/** Stores artifact files on the local filesystem under a configured root. */
@Service
public class FileStorageService {

    private final Path root;

    public FileStorageService(AppProperties properties) {
        this.root = Paths.get(properties.getStorage().getRoot()).toAbsolutePath().normalize();
    }

    @PostConstruct
    void init() {
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new IllegalStateException("Could not create storage root: " + root, e);
        }
    }

    /** Stores an uploaded file for an artifact and returns its storage-relative path. */
    public String store(Long artifactId, MultipartFile file) {
        String original = file.getOriginalFilename() == null ? "file" : file.getOriginalFilename();
        String safeName = sanitize(Paths.get(original).getFileName().toString());
        String relative = artifactId + "/" + UUID.randomUUID() + "_" + safeName;
        Path target = root.resolve(relative).normalize();
        if (!target.startsWith(root)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid file path");
        }
        try {
            Files.createDirectories(target.getParent());
            try (InputStream in = file.getInputStream()) {
                Files.copy(in, target);
            }
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to store file: " + e.getMessage());
        }
        return relative;
    }

    /** Copies an existing file (e.g. from import staging) into an artifact's storage and returns its relative path. */
    public String storeFromPath(Long artifactId, Path source, String originalName) {
        String base = originalName == null ? "file" : originalName;
        String safeName = sanitize(Paths.get(base).getFileName().toString());
        String relative = artifactId + "/" + UUID.randomUUID() + "_" + safeName;
        Path target = root.resolve(relative).normalize();
        if (!target.startsWith(root)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid file path");
        }
        try {
            Files.createDirectories(target.getParent());
            Files.copy(source, target);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to store file: " + e.getMessage());
        }
        return relative;
    }

    public Path resolve(String relativePath) {
        Path target = root.resolve(relativePath).normalize();
        if (!target.startsWith(root)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid file path");
        }
        return target;
    }

    public InputStream openStream(String relativePath) {
        try {
            return Files.newInputStream(resolve(relativePath));
        } catch (IOException e) {
            throw new ApiException(HttpStatus.NOT_FOUND, "File not found on disk");
        }
    }

    public void delete(String relativePath) {
        if (relativePath == null) {
            return;
        }
        try {
            Files.deleteIfExists(resolve(relativePath));
        } catch (IOException ignored) {
            // Best-effort cleanup; DB is the source of truth.
        }
    }

    public void deleteArtifactDirectory(Long artifactId) {
        Path dir = root.resolve(String.valueOf(artifactId)).normalize();
        if (!dir.startsWith(root) || !Files.exists(dir)) {
            return;
        }
        try (var walk = Files.walk(dir)) {
            walk.sorted((a, b) -> b.getNameCount() - a.getNameCount())
                    .forEach(p -> {
                        try {
                            Files.deleteIfExists(p);
                        } catch (IOException ignored) {
                            // Best-effort cleanup.
                        }
                    });
        } catch (IOException ignored) {
            // Directory may not exist.
        }
    }

    private String sanitize(String name) {
        return name.replaceAll("[\\\\/:*?\"<>|]", "_");
    }
}
