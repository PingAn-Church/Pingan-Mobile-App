package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.dto.ThreadDto;
import com.fyp.backend.exception.ContentUnderReviewException;
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

@ExtendWith(MockitoExtension.class)
class ReportedContentHardeningTest {

    @Mock private MessageRepository messageRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private UserRepository userRepository;
    @Mock private MessageDeliveryStatusRepository deliveryStatusRepository;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private OssCleanupService ossCleanupService;
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
    @Mock private TopicSubscriptionService topicSubscriptionService;
    @Mock private PushMessages pushMessages;
    // Real instance — masking is deterministic and test fixtures use clean text.
    @Spy private ContentSanitizer contentSanitizer = new ContentSanitizer();

    @InjectMocks private ChatService chatService;
    @InjectMocks private ThreadService threadService;
    @InjectMocks private ThreadReplyService threadReplyService;
    @InjectMocks private ReviewService reviewService;

    private User user(long id, boolean admin) {
        User user = new User();
        user.setId(id);
        user.setFirstName("User");
        user.setLastName(String.valueOf(id));
        user.setEmail("user" + id + "@example.com");
        user.setAdmin(admin);
        return user;
    }

    private Message reportedMessage() {
        User sender = user(1L, false);
        GroupConversation conversation = new GroupConversation();
        conversation.setId(42L);
        conversation.setParticipants(List.of(sender, user(2L, false)));

        Message message = new Message();
        message.setId(5L);
        message.setSender(sender);
        message.setConversation(conversation);
        message.setConversationType("group");
        message.setType("text");
        message.setContent("private reported text");
        message.setTimestamp(new Timestamp(System.currentTimeMillis()));
        message.setReported(true);
        message.setDeliveryStatuses(List.of());
        return message;
    }

    @Test
    void messageDtoMasksReportedContentForOtherUsersButNotAuthorOrAdmin() {
        Message message = reportedMessage();

        assertNull(new MessageDto(message, user(2L, false)).getContent());
        assertEquals("private reported text", new MessageDto(message, user(1L, false)).getContent());
        assertEquals("private reported text", new MessageDto(message, user(3L, true)).getContent());
    }

    @Test
    void chatEditRejectsReportedMessage() {
        when(messageRepository.findById(5L)).thenReturn(Optional.of(reportedMessage()));

        assertThrows(ContentUnderReviewException.class,
                () -> chatService.editMessageAndBroadcast(5L, "changed", "group", 1L));
    }

    @Test
    void threadReadMasksOtherUsersAndEditIsBlocked() {
        User author = user(1L, false);
        User viewer = user(2L, false);
        Thread thread = Thread.builder()
                .id(7L)
                .title("Reported title")
                .content("Reported body")
                .createdBy(author)
                .reported(true)
                .build();
        when(threadRepository.findById(7L)).thenReturn(Optional.of(thread));
        when(userService.getUserFromToken("Bearer viewer")).thenReturn(Optional.of(viewer));
        when(userService.getUserFromToken("Bearer author")).thenReturn(Optional.of(author));

        ThreadDto masked = threadService.getThreadDtoById(7L, "Bearer viewer");
        assertNull(masked.getTitle());
        assertNull(masked.getContent());
        assertThrows(ContentUnderReviewException.class,
                () -> threadService.editThread(7L,
                        ThreadDto.builder().title("new").content("new").build(),
                        "Bearer author"));
    }

    @Test
    void replyReadMasksOtherUsersAndEditIsBlocked() {
        User author = user(1L, false);
        Thread thread = Thread.builder().id(7L).createdBy(author).build();
        ThreadReply reply = ThreadReply.builder()
                .id(8L)
                .content("Reported reply")
                .author(author)
                .thread(thread)
                .reported(true)
                .build();
        when(jwtUtil.extractEmail("viewer")).thenReturn("user2@example.com");
        when(jwtUtil.extractEmail("author")).thenReturn("user1@example.com");
        when(userRepository.findByEmail("user2@example.com")).thenReturn(Optional.of(user(2L, false)));
        when(userRepository.findByEmail("user1@example.com")).thenReturn(Optional.of(author));
        when(threadReplyRepository.findByThreadIdOrderByIdDesc(7L, PageRequest.of(0, 21)))
                .thenReturn(List.of(reply));
        when(threadReplyRepository.findById(8L)).thenReturn(Optional.of(reply));

        Map<String, Object> page = threadReplyService.getRepliesPage(7L, null, 20, "Bearer viewer");
        @SuppressWarnings("unchecked")
        List<com.fyp.backend.dto.ThreadReplyDto> items =
                (List<com.fyp.backend.dto.ThreadReplyDto>) page.get("data");
        assertNull(items.get(0).getContent());
        assertThrows(ContentUnderReviewException.class,
                () -> threadReplyService.editReply(8L,
                        com.fyp.backend.dto.ThreadReplyDto.builder().content("new").build(),
                        "Bearer author"));
    }

    @Test
    void reviewReadMasksGuestAndEditIsBlocked() {
        CourseRating rating = new CourseRating();
        rating.setId(9L);
        rating.setCourseId(33L);
        rating.setUserId(1L);
        rating.setRating(1);
        rating.setReview("Reported review");
        rating.setAnonymous(true);
        rating.setReviewStatus("flagged");
        when(courseRatingRepository.findByCourseIdAndReviewStatusIn(
                any(), any(), any())).thenReturn(new PageImpl<>(List.of(rating)));
        when(courseRatingRepository.findByCourseIdAndUserId(33L, 1L))
                .thenReturn(Optional.of(rating));

        Map<String, Object> result = reviewService.listReviews(
                33L, null, PageRequest.of(0, 20));
        @SuppressWarnings("unchecked")
        Map<String, Object> masked = ((List<Map<String, Object>>) result.get("data")).get(0);
        assertNull(masked.get("rating"));
        assertNull(masked.get("review"));
        assertThrows(ContentUnderReviewException.class,
                () -> reviewService.updateReview(33L, 1L, 5, "new", false));
    }
}
