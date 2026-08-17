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
 * The bulk "mark this conversation read" statement behind the ✓✓ / Seen tick.
 *
 * Receipts are a private-chat feature now — groups would need a row per member
 * per message, and read state there is a watermark instead. What is tested here
 * is the receipt flip itself: every row for this reader in this conversation, not
 * just the page the client had loaded, and nobody else's. In-memory H2, no Docker.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@TestPropertySource(properties = "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect")
class MessageDeliveryStatusRepositoryTest {

    @Autowired private MessageDeliveryStatusRepository deliveryStatusRepository;
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

    /** Receipts for this reader that are not yet READ, across every conversation. */
    private long unreadReceipts(User reader) {
        return em.getEntityManager()
                .createQuery("SELECT COUNT(d) FROM MessageDeliveryStatus d "
                        + "WHERE d.user.id = :u AND d.status <> 'READ'", Long.class)
                .setParameter("u", reader.getId())
                .getSingleResult();
    }

    private long unreadReceipts(User reader, Conversation target) {
        return em.getEntityManager()
                .createQuery("SELECT COUNT(d) FROM MessageDeliveryStatus d "
                        + "WHERE d.user.id = :u AND d.status <> 'READ' AND d.message.conversation.id = :c", Long.class)
                .setParameter("u", reader.getId())
                .setParameter("c", target.getId())
                .getSingleResult();
    }

    @BeforeEach
    void setUp() {
        me = persistUser("me@example.com");
        other = persistUser("other@example.com");
        conversation = privateConversation(me, other);
    }

    @Test
    void markConversationReadFlipsEveryReceiptNotJustALoadedPage() {
        for (int i = 0; i < 50; i++) {
            delivered(conversation, other, me, "message " + i);
        }
        em.flush();

        assertEquals(50, deliveryStatusRepository.markConversationRead(conversation.getId(), me.getId()));
        assertEquals(0, unreadReceipts(me));
    }

    @Test
    void markConversationReadLeavesTheSendersOwnViewAlone() {
        delivered(conversation, other, me, "theirs");
        delivered(conversation, me, other, "mine");
        em.flush();

        deliveryStatusRepository.markConversationRead(conversation.getId(), me.getId());

        // Reading my copy of the conversation says nothing about whether the other
        // person has read what I sent them.
        assertEquals(0, unreadReceipts(me));
        assertEquals(1, unreadReceipts(other));
    }

    @Test
    void markConversationReadTouchesOnlyTheNamedConversation() {
        User third = persistUser("third@example.com");
        PrivateConversation elsewhere = privateConversation(me, third);
        delivered(conversation, other, me, "here");
        delivered(elsewhere, third, me, "somewhere else");
        em.flush();

        deliveryStatusRepository.markConversationRead(conversation.getId(), me.getId());

        assertEquals(0, unreadReceipts(me, conversation));
        assertEquals(1, unreadReceipts(me, elsewhere));
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
