package com.fyp.backend.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Timestamp;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.TestPropertySource;

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
        Message m = new Message();
        m.setContent(content);
        m.setType("text");
        m.setConversationType("private");
        m.setConversation(conversation);
        m.setSender(sender);
        m.setTimestamp(now());
        return em.persist(m);
    }

    private void markRead(Message m, User reader) {
        em.persist(new MessageDeliveryStatus(m, reader, "READ", now()));
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
}
