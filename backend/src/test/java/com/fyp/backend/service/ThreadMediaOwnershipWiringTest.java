package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fyp.backend.dto.ThreadDto;
import com.fyp.backend.dto.ThreadReplyDto;
import com.fyp.backend.model.Thread;
import com.fyp.backend.model.ThreadReply;
import com.fyp.backend.model.User;
import com.fyp.backend.mq.FanoutPublisher;
import com.fyp.backend.repository.ThreadReplyRepository;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;

@ExtendWith(MockitoExtension.class)
class ThreadMediaOwnershipWiringTest {

    private static final String IMAGE = "threadPictures/u4_image_123.jpg";

    @Mock private ThreadRepository threadRepository;
    @Mock private ThreadReplyRepository threadReplyRepository;
    @Mock private UserRepository userRepository;
    @Mock private UserService userService;
    @Mock private JwtUtil jwtUtil;
    @Mock private ModerationEventPublisher moderationEventPublisher;
    @Mock private ContentSanitizer contentSanitizer;
    @Mock private TopicSubscriptionService topicSubscriptionService;
    @Mock private FanoutPublisher fanoutPublisher;
    @Mock private PushMessages pushMessages;
    @Mock private ThreadContentCleanupService threadContentCleanupService;

    @InjectMocks private ThreadService threadService;
    @InjectMocks private ThreadReplyService threadReplyService;

    @Test
    void createThreadValidatesCoverAgainstTheAuthenticatedAuthor() {
        User author = author();
        when(userService.getUserFromToken("Bearer token")).thenReturn(Optional.of(author));
        when(contentSanitizer.mask(any())).thenAnswer(inv -> inv.getArgument(0));
        when(threadContentCleanupService.requireOwnedImageReference(IMAGE, 4L)).thenReturn(IMAGE);
        when(threadRepository.save(any(Thread.class))).thenAnswer(inv -> inv.getArgument(0));

        threadService.createThread(ThreadDto.builder()
                .title("Title")
                .content("Body")
                .coverImage(IMAGE)
                .build(), "Bearer token");

        verify(threadContentCleanupService).requireOwnedImageReference(IMAGE, 4L);
        ArgumentCaptor<Thread> saved = ArgumentCaptor.forClass(Thread.class);
        verify(threadRepository).save(saved.capture());
        org.junit.jupiter.api.Assertions.assertEquals(IMAGE, saved.getValue().getCoverImage());
    }

    @Test
    void addReplyDoesNotSaveWhenOwnershipValidationFails() {
        User author = author();
        Thread thread = Thread.builder().id(7L).build();
        when(threadRepository.findById(7L)).thenReturn(Optional.of(thread));
        when(jwtUtil.extractEmail("token")).thenReturn(author.getEmail());
        when(userRepository.findByEmail(author.getEmail())).thenReturn(Optional.of(author));
        when(contentSanitizer.mask(any())).thenAnswer(inv -> inv.getArgument(0));
        when(threadContentCleanupService.requireOwnedImageReference(IMAGE, 4L))
                .thenThrow(new IllegalArgumentException("not owned"));

        assertThrows(IllegalArgumentException.class, () -> threadReplyService.addReply(
                ThreadReplyDto.builder().threadId(7L).content("Reply").imageUrl(IMAGE).build(),
                "Bearer token"));

        verify(threadReplyRepository, never()).save(any(ThreadReply.class));
    }

    private User author() {
        User user = new User();
        user.setId(4L);
        user.setEmail("author@example.com");
        user.setFirstName("A");
        user.setLastName("User");
        return user;
    }
}
