package com.dsv.edinav.storage;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.config.AppProperties;
import jakarta.annotation.PostConstruct;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Extracts an uploaded ZIP archive into a temporary staging area so it can be
 * analysed and then materialised into an artifact in a second request. Staging
 * directories are keyed by an opaque token and cleaned up lazily by TTL.
 */
@Service
public class ImportStagingService {

    private static final long TTL_MS = 2L * 60 * 60 * 1000; // 2 hours
    private static final int MAX_ENTRIES = 5000;
    private static final long MAX_TOTAL_BYTES = 512L * 1024 * 1024;
    private static final long MAX_SINGLE_BYTES = 256L * 1024 * 1024;

    private final Path stagingRoot;

    public ImportStagingService(AppProperties properties) {
        Path root = Paths.get(properties.getStorage().getRoot()).toAbsolutePath().normalize();
        this.stagingRoot = root.resolve("_import-staging");
    }

    @PostConstruct
    void init() {
        try {
            Files.createDirectories(stagingRoot);
        } catch (IOException e) {
            throw new IllegalStateException("Could not create import staging root: " + stagingRoot, e);
        }
    }

    /** Extracts the uploaded ZIP into a fresh staging directory and returns its token. */
    public String stageZip(MultipartFile zip) {
        cleanupExpired();
        if (zip == null || zip.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No import archive provided");
        }
        String original = zip.getOriginalFilename();
        if (original == null || !original.toLowerCase().endsWith(".zip")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Import archive must be a .zip file");
        }
        String token = UUID.randomUUID().toString();
        Path dir = stagingRoot.resolve(token).normalize();
        if (!dir.startsWith(stagingRoot)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid staging path");
        }
        try {
            Files.createDirectories(dir);
            extract(zip, dir);
        } catch (ApiException e) {
            deleteQuietly(dir);
            throw e;
        } catch (IOException e) {
            deleteQuietly(dir);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to read import archive: " + e.getMessage());
        }
        return token;
    }

    private void extract(MultipartFile zip, Path dir) throws IOException {
        int entries = 0;
        long total = 0;
        try (ZipInputStream zis = new ZipInputStream(zip.getInputStream())) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String name = entry.getName();
                if (shouldSkip(name)) {
                    zis.closeEntry();
                    continue;
                }
                Path target = dir.resolve(name).normalize();
                if (!target.startsWith(dir)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Archive contains an invalid path: " + name);
                }
                if (entry.isDirectory()) {
                    Files.createDirectories(target);
                } else {
                    if (++entries > MAX_ENTRIES) {
                        throw new ApiException(HttpStatus.BAD_REQUEST, "Archive contains too many files");
                    }
                    Files.createDirectories(target.getParent());
                    long written = copyLimited(zis, target, total);
                    total += written;
                }
                zis.closeEntry();
            }
        }
    }

    private long copyLimited(InputStream in, Path target, long totalSoFar) throws IOException {
        long written = 0;
        byte[] buffer = new byte[8192];
        int read;
        try (OutputStream os = Files.newOutputStream(target)) {
            while ((read = in.read(buffer)) > 0) {
                os.write(buffer, 0, read);
                written += read;
                if (written > MAX_SINGLE_BYTES) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "A file in the archive is too large");
                }
                if (totalSoFar + written > MAX_TOTAL_BYTES) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "The archive is too large");
                }
            }
        }
        return written;
    }

    /** Returns the staging directory for a token, validating the token and its location. */
    public Path resolveToken(String token) {
        if (token == null || !token.matches("[0-9a-fA-F-]{36}")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid import token");
        }
        Path dir = stagingRoot.resolve(token).normalize();
        if (!dir.startsWith(stagingRoot) || !Files.isDirectory(dir)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Import session expired or not found");
        }
        return dir;
    }

    public void deleteToken(String token) {
        if (token == null || !token.matches("[0-9a-fA-F-]{36}")) {
            return;
        }
        Path dir = stagingRoot.resolve(token).normalize();
        if (dir.startsWith(stagingRoot)) {
            deleteQuietly(dir);
        }
    }

    private void cleanupExpired() {
        if (!Files.isDirectory(stagingRoot)) {
            return;
        }
        long cutoff = Instant.now().toEpochMilli() - TTL_MS;
        try (var children = Files.list(stagingRoot)) {
            children.filter(Files::isDirectory).forEach(dir -> {
                try {
                    if (Files.getLastModifiedTime(dir).toMillis() < cutoff) {
                        deleteQuietly(dir);
                    }
                } catch (IOException ignored) {
                    // Best-effort cleanup.
                }
            });
        } catch (IOException ignored) {
            // Best-effort cleanup.
        }
    }

    private void deleteQuietly(Path dir) {
        if (!Files.exists(dir)) {
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
            // Directory may already be gone.
        }
    }

    private boolean shouldSkip(String name) {
        String normalised = name.replace('\\', '/');
        for (String segment : normalised.split("/")) {
            if (segment.equals("__MACOSX") || segment.equals(".DS_Store") || segment.startsWith("._")) {
                return true;
            }
        }
        return false;
    }
}
