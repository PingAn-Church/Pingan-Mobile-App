package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fyp.backend.dto.CreatePollRequest;
import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.Poll;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PollOptionRepository;
import com.fyp.backend.repository.PollVoteRepository;
import com.fyp.backend.repository.UserRepository;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.messaging.simp.SimpMessagingTemplate;

/**
 * Joining and then leaving a sign-up sheet against a real (H2) database.
 *
 * The unit tests mock the repositories, so they never see what a bulk
 * {@code @Modifying(clearAutomatically = true)} delete does to the entities
 * already loaded in the same transaction. This one does.
 */
@SpringBootTest(properties = {
        "IP_ADDR=127.0.0.1",
        "spring.datasource.url=jdbc:h2:mem:poll-signup-test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"
})
class PollSignupWithdrawalTest {

    @Autowired private PollService pollService;
    @Autowired private UserRepository userRepository;
    @Autowired private GroupConversationRepository groupConversationRepository;
    @Autowired private MessageRepository messageRepository;
    @Autowired private PollOptionRepository optionRepository;
    @Autowired private PollVoteRepository voteRepository;

    // The re-broadcast after commit goes to the STOMP broker; not under test here.
    @MockBean private SimpMessagingTemplate messagingTemplate;

    @Test
    void aMemberCanJoinAndThenLeaveASignUpSheet() {
        User creator = user("creator@example.com");
        User joiner = user("joiner@example.com");
        GroupConversation group = group(creator, joiner);
        Message message = pollMessage(group, creator);

        CreatePollRequest request = new CreatePollRequest();
        request.setConversationId(group.getId());
        request.setQuestion("Potluck sign-up");
        request.setMode("SIGNUP");
        Poll poll = pollService.create(group.getId(), creator.getId(), request);
        pollService.attachMessage(poll.getId(), message.getId());

        pollService.addEntry(poll.getId(), joiner.getId(), null, "bringing rice");
        assertEquals(1, optionRepository.countByPollId(poll.getId()));
        assertEquals(1, voteRepository.findByPollIdAndUserId(poll.getId(), joiner.getId()).size());

        MessageDto mine = pollService.removeEntry(poll.getId(), joiner.getId());

        assertEquals(0, optionRepository.countByPollId(poll.getId()));
        assertTrue(voteRepository.findByPollIdAndUserId(poll.getId(), joiner.getId()).isEmpty());
        assertNotNull(mine.getPoll());
        assertTrue(mine.getPoll().getMyOptionIds() == null || mine.getPoll().getMyOptionIds().isEmpty());
        assertEquals(message.getId(), mine.getMessageId());
    }

    private User user(String email) {
        User user = new User();
        user.setEmail(email);
        user.setFirstName("A");
        user.setLastName("B");
        user.setPassword("x");
        user.setActive(true);
        return userRepository.save(user);
    }

    private GroupConversation group(User... members) {
        GroupConversation group = new GroupConversation();
        group.setGroupName("Potluck");
        group.setParticipants(new ArrayList<>(List.of(members)));
        group.setCreatedAt(new Timestamp(System.currentTimeMillis()));
        group.setUpdatedAt(new Timestamp(System.currentTimeMillis()));
        return groupConversationRepository.save(group);
    }

    private Message pollMessage(GroupConversation group, User sender) {
        Message message = new Message();
        message.setContent("Potluck sign-up");
        message.setType("poll");
        message.setConversationType("group");
        message.setConversation(group);
        message.setSender(sender);
        message.setTimestamp(new Timestamp(System.currentTimeMillis()));
        return messageRepository.save(message);
    }
}
