package com.fyp.backend.service;

import java.util.Collection;
import java.util.Objects;
import java.util.logging.Logger;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Deletes managed OSS objects only after the surrounding database transaction
 * commits. This prevents a rollback from leaving a row that points at an object
 * which has already been removed.
 */
@Service
public class OssCleanupService {

    private static final Logger LOGGER = Logger.getLogger(OssCleanupService.class.getName());

    private final OSSService ossService;
    private final MediaReferenceService mediaReferenceService;

    public OssCleanupService(OSSService ossService, MediaReferenceService mediaReferenceService) {
        this.ossService = ossService;
        this.mediaReferenceService = mediaReferenceService;
    }

    public void deleteAfterCommit(String objectUrl) {
        deleteAfterCommit(java.util.Collections.singletonList(objectUrl));
    }

    public void deleteAfterCommit(Collection<String> objectUrls) {
        if (objectUrls == null) {
            return;
        }
        var urls = objectUrls.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(url -> !url.isEmpty())
                .distinct()
                .toList();
        if (urls.isEmpty()) {
            return;
        }

        Runnable delete = () -> urls.forEach(url -> {
            try {
                if (mediaReferenceService.isReferencedByUrl(url)) {
                    LOGGER.fine("Skipping OSS cleanup because media is still referenced.");
                    return;
                }
                ossService.deleteObjectByUrl(url);
            } catch (Exception e) {
                LOGGER.warning("Failed to delete OSS object after commit: " + e.getMessage());
            }
        });

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    delete.run();
                }
            });
        } else {
            delete.run();
        }
    }

}
