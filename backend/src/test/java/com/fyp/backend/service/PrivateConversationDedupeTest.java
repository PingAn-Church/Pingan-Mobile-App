package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import com.fyp.backend.dto.ConversationDto;
import com.fyp.backend.model.PrivateConversation;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.ConversationMuteRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageDeliveryStatusRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PrivateConversationRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * One private conversation per pair: creating a chat with someone you already
 * chat with must hand back the existing conversation, whichever way round its
 * columns store the pair, instead of splitting the history across a duplicate.
 */
@ExtendWith(MockitoExtension.class)
class PrivateConversationDedupeTest {

    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private UserRepository userRepository;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private OSSService ossService;
    @Mock private MessageRepository messageRepository;
    @Mock private MessageDeliveryStatusRepository messageDeliveryStatusRepository;
    @Mock private ConversationMuteRepository conversationMuteRepository;
    @Mock private OssCleanupService ossCleanupService;

    @InjectMocks private ConversationService conversationService;

    private User user(long id) {
        User user = new User();
        user.setId(id);
        user.setFirstName("User");
        user.setLastName(String.valueOf(id));
        user.setEmail("user" + id + "@example.com");
        user.setVerifiedUser(true);
        user.setActive(true);
        user.setDeletedAccount(false);
        return user;
    }

    @Test
    void creatingAnExistingPairReturnsTheExistingConversation() {
        User creator = user(1L);
        User other = user(2L);
        lenient().when(userRepository.findById(1L)).thenReturn(Optional.of(creator));
        lenient().when(userRepository.findById(2L)).thenReturn(Optional.of(other));

        PrivateConversation existing = new PrivateConversation();
        existing.setId(99L);
        existing.setUserOne(other); // stored the other way round — must still match
        existing.setUserTwo(creator);
        when(privateConversationRepository.findByPair(1L, 2L)).thenReturn(List.of(existing));

        ConversationDto request = new ConversationDto();
        request.setConversationType("private");
        request.setParticipants(new ArrayList<>(List.of(2L)));

        ConversationDto result = conversationService.createPrivateConversation(request, 1L);

        assertEquals(99L, result.getConversationId());
        verify(privateConversationRepository, never()).save(any(PrivateConversation.class));
    }
}
