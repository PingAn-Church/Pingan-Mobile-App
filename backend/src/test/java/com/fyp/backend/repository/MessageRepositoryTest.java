package com.fyp.backend.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.TestPropertySource;

import com.fyp.backend.model.Conversation;
import com.fyp.backend.model.ConversationMute;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageDeliveryStatus;
import com.fyp.backend.model.PrivateConversation;
import com.fyp.backend.model.User;

/**
 * Exercises the chat-history queries added for windowed history + unread badges:
 * cursor pagination (newest-first) and the unread-count JPQL. In-memory H2, no Docker.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@TestPropertySource(properties = "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect")
class MessageRepositoryTest {

    @Autowired private MessageRepository messageRepository;
    @Autowired private TestEntityManager em;

    private User me;
    private User other;
    private PrivateConversation conversation;

    private Timestamp now() {
        return new Timestamp(System.currentTimeMillis());
    }

    private User persistUser(String email) {
        User u = new User();
        u.setFirstName("F");
        u.setLastName("L");
        u.setEmail(email);
        u.setPassword("hash");
        u.setActive(true);
        return em.persist(u);
    }

    @BeforeEach
    void setUp() {
        me = persistUser("me@example.com");
        other = persistUser("other@example.com");
        conversation = new PrivateConversation();
        conversation.setUserOne(me);
        conversation.setUserTwo(other);
        conversation.setCreatedAt(now());
        conversation.setUpdatedAt(now());
        em.persist(conversation);
    }

    private Message message(User sender, String content) {
        return message(conversation, "private", sender, content);
    }

    private Message message(Conversation target, String type, User sender, String content) {
        Message m = new Message();
        m.setContent(content);
        m.setType("text");
        m.setConversationType(type);
        m.setConversation(target);
        m.setSender(sender);
        m.setTimestamp(now());
        return em.persist(m);
    }

    private void markRead(Message m, User reader) {
        em.persist(new MessageDeliveryStatus(m, reader, "READ", now()));
    }

    private GroupConversation group(String name, User... members) {
        GroupConversation g = new GroupConversation();
        g.setGroupName(name); // non-null column
        g.setParticipants(new ArrayList<>(List.of(members)));
        g.setCreatedAt(now());
        g.setUpdatedAt(now());
        return em.persist(g);
    }

    private void mute(User user, Conversation target, String type) {
        em.persist(new ConversationMute(user.getId(), target.getId(), type));
    }

    @Test
    void countUnreadExcludesOwnMessagesAndReadOnes() {
        message(other, "unread one");
        Message readByMe = message(other, "will be read");
        message(me, "my own message"); // sent by me -> never unread for me
        markRead(readByMe, me);
        em.flush();

        assertEquals(1, messageRepository.countUnread(conversation.getId(), me.getId()));
        // The other participant has two unread (both of my... no, just my one message)
        assertEquals(1, messageRepository.countUnread(conversation.getId(), other.getId()));
    }

    @Test
    void cursorPaginationReturnsNewestFirstAndWalksOlder() {
        for (int i = 1; i <= 5; i++) {
            message(other, "m" + i);
        }
        em.flush();

        List<Message> firstPage =
                messageRepository.findByConversationIdOrderByIdDesc(conversation.getId(), PageRequest.of(0, 2));
        assertEquals(2, firstPage.size());
        // newest-first: first element has the largest id
        assertTrue(firstPage.get(0).getId() > firstPage.get(1).getId());

        Long oldestSoFar = firstPage.get(firstPage.size() - 1).getId();
        List<Message> older = messageRepository.findByConversationIdAndIdLessThanOrderByIdDesc(
                conversation.getId(), oldestSoFar, PageRequest.of(0, 2));
        assertEquals(2, older.size());
        assertTrue(older.get(0).getId() < oldestSoFar); // strictly older than the cursor
    }

    @Test
    void totalUnreadSpansPrivateAndGroupConversations() {
        GroupConversation prayerGroup = group("Prayer", me, other);
        message(other, "private one");
        message(prayerGroup, "group", other, "group one");
        message(prayerGroup, "group", other, "group two");
        em.flush();

        assertEquals(3, messageRepository.countTotalUnread(me.getId()));
    }

    @Test
    void totalUnreadIgnoresOwnMessagesAndAlreadyReadOnes() {
        message(me, "my own message");
        Message read = message(other, "already seen");
        message(other, "still waiting");
        markRead(read, me);
        em.flush();

        assertEquals(1, messageRepository.countTotalUnread(me.getId()));
    }

    @Test
    void totalUnreadLeavesOutMutedConversations() {
        GroupConversation noisyGroup = group("Noisy", me, other);
        message(other, "private one");
        message(noisyGroup, "group", other, "group one");
        message(noisyGroup, "group", other, "group two");
        mute(me, noisyGroup, "group");
        em.flush();

        // The muted group still has unread of its own for the chat list; it just
        // doesn't demand attention app-wide.
        assertEquals(1, messageRepository.countTotalUnread(me.getId()));
        assertEquals(2, messageRepository.countUnread(noisyGroup.getId(), me.getId()));
    }

    @Test
    void totalUnreadIgnoresConversationsTheUserIsNotIn() {
        User stranger = persistUser("stranger@example.com");
        User friend = persistUser("friend@example.com");
        GroupConversation theirGroup = group("Theirs", stranger, friend);
        message(theirGroup, "group", stranger, "not for me");
        em.flush();

        assertEquals(0, messageRepository.countTotalUnread(me.getId()));
    }
}
