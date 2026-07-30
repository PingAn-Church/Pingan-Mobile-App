package com.fyp.backend.service;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@ExtendWith(MockitoExtension.class)
class OssCleanupServiceTest {

    @Mock private OSSService ossService;
    @Mock private MediaReferenceService mediaReferenceService;
    @InjectMocks private OssCleanupService cleanupService;

    @BeforeEach
    void startSynchronization() {
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void rollbackDoesNotDeleteObject() {
        cleanupService.deleteAfterCommit("https://oss.example.com/coursePictures/cover.jpg");

        TransactionSynchronizationManager.getSynchronizations()
                .forEach(sync -> sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));

        verify(ossService, never()).deleteObjectByUrl(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void commitDeletesObject() {
        String url = "https://oss.example.com/coursePictures/cover.jpg";
        cleanupService.deleteAfterCommit(url);

        TransactionSynchronizationManager.getSynchronizations()
                .forEach(TransactionSynchronization::afterCommit);

        verify(ossService).deleteObjectByUrl(url);
    }

    @Test
    void commitKeepsObjectStillReferencedElsewhere() {
        String url = "https://oss.example.com/coursePictures/shared.jpg";
        org.mockito.Mockito.when(mediaReferenceService.isReferencedByUrl(url)).thenReturn(true);
        cleanupService.deleteAfterCommit(url);

        TransactionSynchronizationManager.getSynchronizations()
                .forEach(TransactionSynchronization::afterCommit);

        verify(ossService, never()).deleteObjectByUrl(url);
    }
}
