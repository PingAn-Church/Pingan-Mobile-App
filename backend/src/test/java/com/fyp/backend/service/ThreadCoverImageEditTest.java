package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fyp.backend.dto.ThreadDto;
import com.fyp.backend.model.Thread;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;

/**
 * Editing a topic must tell "I am not talking about the picture" apart from
 * "remove the picture".
 *
 * Every app build released before cover pictures existed sends only a title and a
 * body. Reading that silence as "remove" meant editing a topic from an older
 * phone silently wiped a cover set from a newer one — the kind of loss nobody
 * notices until the picture is gone.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ThreadCoverImageEditTest {

    private static final String COVER = "threadPictures/abc-123.jpg";

    @Mock private ThreadRepository threadRepository;
    @Mock private UserRepository userRepository;
    @Mock private UserService userService;
    @Mock private JwtUtil jwtUtil;
    @Mock private ModerationEventPublisher moderationEventPublisher;
    @Mock private TopicSubscriptionService topicSubscriptionService;
    @Mock private ThreadContentCleanupService threadContentCleanupService;
    @Spy private ContentSanitizer contentSanitizer = new ContentSanitizer();

    @InjectMocks private ThreadService threadService;

    private User author() {
        User u = new User();
        u.setId(1L);
        u.setEmail("author@example.com");
        u.setFirstName("A");
        u.setLastName("B");
        return u;
    }

    /** An existing topic that already has a cover picture. */
    private Thread existing() {
        Thread t = new Thread();
        t.setId(7L);
        t.setTitle("Sunday lunch");
        t.setContent("Who is coming?");
        t.setCoverImage(COVER);
        t.setCreatedBy(author());
        return t;
    }

    private Thread edit(ThreadDto dto) {
        Thread thread = existing();
        when(threadRepository.findById(7L)).thenReturn(Optional.of(thread));
        when(userService.getUserFromToken("Bearer t")).thenReturn(Optional.of(author()));
        when(threadRepository.save(any(Thread.class))).thenAnswer(i -> i.getArgument(0));
        when(threadContentCleanupService.requireOwnedImageReference(any(String.class), anyLong()))
                .thenAnswer(i -> i.getArgument(0));

        threadService.editThread(7L, dto, "Bearer t");
        return thread;
    }

    private ThreadDto dto(String coverImage) {
        return ThreadDto.builder()
                .title("Sunday lunch")
                .content("Who is coming? Updated.")
                .coverImage(coverImage)
                .build();
    }

    @Test
    void anEditThatNeverMentionsTheCoverLeavesItAlone() {
        // This is what an older build sends: title and body, no cover field.
        assertEquals(COVER, edit(dto(null)).getCoverImage());
    }

    @Test
    void anEmptyStringIsHowTheCoverIsActuallyRemoved() {
        assertNull(edit(dto("")).getCoverImage());
        verify(threadContentCleanupService).cleanupReplacedReference(COVER, null);
    }

    @Test
    void aNewCoverReplacesTheOldOne() {
        String replacement = "threadPictures/u1_new-999.jpg";
        assertEquals(replacement, edit(dto(replacement)).getCoverImage());
        verify(threadContentCleanupService).requireOwnedImageReference(replacement, 1L);
        verify(threadContentCleanupService).cleanupReplacedReference(COVER, replacement);
    }

    @Test
    void retainingTheExactLegacyCoverDoesNotRequireNewOwnershipProof() {
        assertEquals(COVER, edit(dto(COVER)).getCoverImage());
        verify(threadContentCleanupService, org.mockito.Mockito.never())
                .requireOwnedImageReference(any(String.class), anyLong());
    }
}
