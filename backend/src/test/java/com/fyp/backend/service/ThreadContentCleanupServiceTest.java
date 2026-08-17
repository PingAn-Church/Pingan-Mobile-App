package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.model.Thread;
import com.fyp.backend.model.ThreadReply;
import com.fyp.backend.repository.ThreadReplyRepository;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.ThreadSubscriptionRepository;

@ExtendWith(MockitoExtension.class)
class ThreadContentCleanupServiceTest {

    private static final String COVER = "threadPictures/u4_cover_123.jpg";
    private static final String REPLY_IMAGE = "threadPictures/u9_reply_456.jpg";

    @Mock private ThreadRepository threadRepository;
    @Mock private ThreadReplyRepository threadReplyRepository;
    @Mock private ThreadSubscriptionRepository threadSubscriptionRepository;
    @Mock private OssCleanupService ossCleanupService;

    @InjectMocks private ThreadContentCleanupService service;

    @AfterEach
    void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void acceptsOnlyTheAuthorsNewThreadImage() {
        assertEquals(COVER, service.requireOwnedImageReference(COVER, 4L));
        assertEquals("https://oss.example.com/" + COVER,
                service.requireOwnedImageReference("https://oss.example.com/" + COVER, 4L));

        assertThrows(IllegalArgumentException.class,
                () -> service.requireOwnedImageReference(COVER, 5L));
        assertThrows(IllegalArgumentException.class,
                () -> service.requireOwnedImageReference("coursePictures/u4_cover.jpg", 4L));
        assertThrows(IllegalArgumentException.class,
                () -> service.requireOwnedImageReference("threadPictures/nested/u4_cover.jpg", 4L));
    }

    @Test
    void replacementAndRemovalScheduleThePreviousCover() {
        service.cleanupReplacedReference(COVER, "threadPictures/u4_new.jpg");
        service.cleanupReplacedReference(COVER, null);

        verify(ossCleanupService, org.mockito.Mockito.times(2)).deleteAfterCommit(COVER);
    }

    @Test
    void retainingTheSameReferenceDoesNotScheduleCleanup() {
        service.cleanupReplacedReference("  " + COVER, COVER);

        verify(ossCleanupService, never()).deleteAfterCommit(anyString());
    }

    @Test
    void deletingThreadCollectsCoverReplyImagesAndSubscriptions() {
        Thread thread = Thread.builder().id(7L).coverImage(COVER).build();
        when(threadReplyRepository.findIdsByThreadId(7L)).thenReturn(List.of(10L, 11L));
        when(threadReplyRepository.findImageUrlsByThreadId(7L)).thenReturn(List.of(REPLY_IMAGE));

        List<Long> replyIds = service.deleteThread(thread);

        assertEquals(List.of(10L, 11L), replyIds);
        verify(threadSubscriptionRepository).deleteByThreadId(7L);
        verify(threadRepository).delete(thread);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Collection<String>> media = ArgumentCaptor.forClass(Collection.class);
        verify(ossCleanupService).deleteAfterCommit(media.capture());
        assertEquals(List.of(COVER, REPLY_IMAGE), List.copyOf(media.getValue()));
    }

    @Test
    void deletingReplySchedulesItsImage() {
        ThreadReply reply = ThreadReply.builder().id(10L).imageUrl(REPLY_IMAGE).build();

        service.deleteReply(reply);

        verify(threadReplyRepository).delete(reply);
        verify(ossCleanupService).deleteAfterCommit(REPLY_IMAGE);
    }

    @Test
    void missingModeratedContentIsAlreadyClean() {
        when(threadRepository.findById(7L)).thenReturn(Optional.empty());
        when(threadReplyRepository.findById(10L)).thenReturn(Optional.empty());

        assertEquals(List.of(), service.deleteThreadById(7L));
        service.deleteReplyById(10L);

        verify(ossCleanupService, never()).deleteAfterCommit(anyString());
        verify(threadRepository, never()).delete(org.mockito.ArgumentMatchers.any());
        verify(threadReplyRepository, never()).delete(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void rollbackNeverDeletesTheOssObject() {
        OSSService ossService = org.mockito.Mockito.mock(OSSService.class);
        MediaReferenceService referenceService = org.mockito.Mockito.mock(MediaReferenceService.class);
        ThreadContentCleanupService realService = new ThreadContentCleanupService(
                threadRepository,
                threadReplyRepository,
                threadSubscriptionRepository,
                new OssCleanupService(ossService, referenceService));
        ThreadReply reply = ThreadReply.builder().id(10L).imageUrl(REPLY_IMAGE).build();
        TransactionSynchronizationManager.initSynchronization();

        realService.deleteReply(reply);
        verify(ossService, never()).deleteObjectByUrl(anyString());
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(sync -> sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));

        verify(ossService, never()).deleteObjectByUrl(anyString());
    }

    @Test
    void commitDeletesOnlyAfterCommitCallback() {
        OSSService ossService = org.mockito.Mockito.mock(OSSService.class);
        MediaReferenceService referenceService = org.mockito.Mockito.mock(MediaReferenceService.class);
        ThreadContentCleanupService realService = new ThreadContentCleanupService(
                threadRepository,
                threadReplyRepository,
                threadSubscriptionRepository,
                new OssCleanupService(ossService, referenceService));
        ThreadReply reply = ThreadReply.builder().id(10L).imageUrl(REPLY_IMAGE).build();
        TransactionSynchronizationManager.initSynchronization();

        realService.deleteReply(reply);
        verify(ossService, never()).deleteObjectByUrl(anyString());
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(TransactionSynchronization::afterCommit);

        verify(ossService).deleteObjectByUrl(REPLY_IMAGE);
    }
}
