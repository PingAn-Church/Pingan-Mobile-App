package com.fyp.backend.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.sql.Timestamp;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.TestPropertySource;

import com.fyp.backend.model.Conversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageDeliveryStatus;
import com.fyp.backend.model.PrivateConversation;
import com.fyp.backend.model.User;

/**
 * The bulk "mark this conversation read" statement behind opening a chat.
 *
 * Per-message read receipts only ever cover the history page the client loaded,
 * so a conversation with more unread than that page left the rest unread on the
 * server and the badge came back on the next refetch. In-memory H2, no Docker.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@TestPropertySource(properties = "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect")
class MessageDeliveryStatusRepositoryTest {

    @Autowired private MessageDeliveryStatusRepository deliveryStatusRepository;
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

    private PrivateConversation privateConversation(User a, User b) {
        PrivateConversation c = new PrivateConversation();
        c.setUserOne(a);
        c.setUserTwo(b);
        c.setCreatedAt(now());
        c.setUpdatedAt(now());
        return em.persist(c);
    }

    /** A message plus the "SENT" delivery row the send path creates for the recipient. */
    private Message delivered(Conversation target, User sender, User recipient, String content) {
        Message m = new Message();
        m.setContent(content);
        m.setType("text");
        m.setConversationType("private");
        m.setConversation(target);
        m.setSender(sender);
        m.setTimestamp(now());
        em.persist(m);
        em.persist(new MessageDeliveryStatus(m, recipient, "SENT", now()));
        return m;
    }

    @BeforeEach
    void setUp() {
        me = persistUser("me@example.com");
        other = persistUser("other@example.com");
        conversation = privateConversation(me, other);
    }

    @Test
    void markConversationReadClearsEveryUnreadMessageNotJustALoadedPage() {
        for (int i = 0; i < 50; i++) {
            delivered(conversation, other, me, "message " + i);
        }
        em.flush();
        assertEquals(50, messageRepository.countUnread(conversation.getId(), me.getId()));

        assertEquals(50, deliveryStatusRepository.markConversationRead(conversation.getId(), me.getId()));

        assertEquals(0, messageRepository.countUnread(conversation.getId(), me.getId()));
    }

    @Test
    void markConversationReadLeavesTheSendersOwnViewAlone() {
        delivered(conversation, other, me, "theirs");
        delivered(conversation, me, other, "mine");
        em.flush();

        deliveryStatusRepository.markConversationRead(conversation.getId(), me.getId());

        // Reading my copy of the conversation says nothing about whether the other
        // person has read what I sent them.
        assertEquals(0, messageRepository.countUnread(conversation.getId(), me.getId()));
        assertEquals(1, messageRepository.countUnread(conversation.getId(), other.getId()));
    }

    @Test
    void markConversationReadTouchesOnlyTheNamedConversation() {
        User third = persistUser("third@example.com");
        PrivateConversation elsewhere = privateConversation(me, third);
        delivered(conversation, other, me, "here");
        delivered(elsewhere, third, me, "somewhere else");
        em.flush();

        deliveryStatusRepository.markConversationRead(conversation.getId(), me.getId());

        assertEquals(0, messageRepository.countUnread(conversation.getId(), me.getId()));
        assertEquals(1, messageRepository.countUnread(elsewhere.getId(), me.getId()));
    }

    @Test
    void markConversationReadIsIdempotent() {
        delivered(conversation, other, me, "only one");
        em.flush();

        assertEquals(1, deliveryStatusRepository.markConversationRead(conversation.getId(), me.getId()));
        // Nothing left to flip — re-opening a conversation must not churn rows.
        assertEquals(0, deliveryStatusRepository.markConversationRead(conversation.getId(), me.getId()));
    }
}
