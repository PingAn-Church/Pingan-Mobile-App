package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.dto.ThreadDto;
import com.fyp.backend.dto.ThreadReplyDto;
import com.fyp.backend.model.Course;
import com.fyp.backend.model.CourseRating;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.Thread;
import com.fyp.backend.model.ThreadReply;
import com.fyp.backend.model.User;
import com.fyp.backend.mq.MessagePublisher;
import com.fyp.backend.repository.CourseRatingRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageDeliveryStatusRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PrivateConversationRepository;
import com.fyp.backend.repository.ThreadReplyRepository;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;

/**
 * Proves the ContentSanitizer is wired into every UGC write path — banned
 * words are masked before persistence while innocent look-alike substrings
 * ("passage", "assign") pass through untouched.
 */
@ExtendWith(MockitoExtension.class)
class ContentMaskingTest {

    @Mock private MessageRepository messageRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private UserRepository userRepository;
    @Mock private MessageDeliveryStatusRepository deliveryStatusRepository;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private OSSService ossService;
    @Mock private RedisService redisService;
    @Mock private MessagePublisher messagePublisher;
    @Mock private PushNotificationService pushNotificationService;
    @Mock private UserBlockService userBlockService;
    @Mock private ThreadRepository threadRepository;
    @Mock private ThreadReplyRepository threadReplyRepository;
    @Mock private UserService userService;
    @Mock private JwtUtil jwtUtil;
    @Mock private CourseRatingRepository courseRatingRepository;
    @Mock private CourseRepository courseRepository;
    @Mock private ModerationEventPublisher moderationEventPublisher;
    @Spy private ContentSanitizer contentSanitizer = new ContentSanitizer();

    @InjectMocks private ChatService chatService;
    @InjectMocks private ThreadService threadService;
    @InjectMocks private ThreadReplyService threadReplyService;
    @InjectMocks private ReviewService reviewService;

    private User user(long id) {
        User user = new User();
        user.setId(id);
        user.setFirstName("User");
        user.setLastName(String.valueOf(id));
        user.setEmail("user" + id + "@example.com");
        return user;
    }

    @Test
    void createThreadMasksBannedWords() {
        when(userService.getUserFromToken("token")).thenReturn(Optional.of(user(1L)));
        when(threadRepository.save(any(Thread.class))).thenAnswer(inv -> inv.getArgument(0));

        ThreadDto saved = threadService.createThread(ThreadDto.builder()
                .title("What the fuck happened")
                .content("This bullshit again, but the passage stays")
                .build(), "token");

        assertEquals("What the *** happened", saved.getTitle());
        assertEquals("This *** again, but the passage stays", saved.getContent());
    }

    @Test
    void addReplyMasksBannedWords() {
        Thread thread = Thread.builder().id(7L).title("t").content("c").createdBy(user(1L)).build();
        when(threadRepository.findById(7L)).thenReturn(Optional.of(thread));
        when(jwtUtil.extractEmail("raw")).thenReturn("user2@example.com");
        when(userRepository.findByEmail("user2@example.com")).thenReturn(Optional.of(user(2L)));
        when(threadReplyRepository.save(any(ThreadReply.class))).thenAnswer(inv -> inv.getArgument(0));

        ThreadReplyDto saved = threadReplyService.addReply(ThreadReplyDto.builder()
                .threadId(7L)
                .content("you asshole, please assign the passage")
                .build(), "Bearer raw");

        assertEquals("you ***, please assign the passage", saved.getContent());
    }

    @Test
    void postReviewMasksBannedWords() {
        when(courseRepository.findById(3L)).thenReturn(Optional.of(new Course()));
        when(courseRatingRepository.findByCourseIdAndUserId(3L, 2L)).thenReturn(Optional.empty());
        when(courseRatingRepository.save(any(CourseRating.class))).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> result = reviewService.postReview(3L, 2L, 5, "great course, no bullshit", true);

        assertEquals("great course, no ***", result.get("review"));
    }

    @Test
    void editMessageMasksBannedWords() {
        User sender = user(1L);
        GroupConversation conversation = new GroupConversation();
        conversation.setId(42L);
        conversation.setParticipants(List.of(sender, user(2L)));

        Message message = new Message();
        message.setId(5L);
        message.setSender(sender);
        message.setConversation(conversation);
        message.setConversationType("group");
        message.setType("text");
        message.setContent("original");
        message.setTimestamp(new Timestamp(System.currentTimeMillis()));
        message.setDeliveryStatuses(List.of());

        when(messageRepository.findById(5L)).thenReturn(Optional.of(message));
        when(messageRepository.save(any(Message.class))).thenAnswer(inv -> inv.getArgument(0));

        TransactionSynchronizationManager.initSynchronization();
        try {
            MessageDto updated = chatService.editMessageAndBroadcast(5L, "what the fuck", "group", 1L);
            assertEquals("what the ***", updated.getContent());
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }
}
