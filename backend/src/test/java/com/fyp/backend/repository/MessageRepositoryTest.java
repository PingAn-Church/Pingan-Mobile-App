package com.fyp.backend.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

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
import com.fyp.backend.model.ConversationReadState;
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

    private PrivateConversation privateConversation(User a, User b) {
        PrivateConversation c = new PrivateConversation();
        c.setUserOne(a);
        c.setUserTwo(b);
        c.setCreatedAt(now());
        c.setUpdatedAt(now());
        return em.persist(c);
    }

    @BeforeEach
    void setUp() {
        me = persistUser("me@example.com");
        other = persistUser("other@example.com");
        conversation = privateConversation(me, other);
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

    /**
     * Reads everything up to and including this message, the way opening a chat
     * does — read state is a watermark per (conversation, user), not a receipt per
     * message, so "this one is read" necessarily means "and everything before it".
     */
    private void markReadUpTo(Message m, User reader) {
        ConversationReadState state = em.getEntityManager()
                .createQuery("SELECT r FROM ConversationReadState r "
                        + "WHERE r.conversationId = :c AND r.userId = :u", ConversationReadState.class)
                .setParameter("c", m.getConversation().getId())
                .setParameter("u", reader.getId())
                .getResultStream().findFirst().orElse(null);

        if (state == null) {
            em.persist(new ConversationReadState(m.getConversation().getId(), reader.getId(), m.getId()));
        } else {
            state.setLastReadMessageId(m.getId());
            em.persist(state);
        }
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
    void countUnreadExcludesOwnMessagesAndAnythingBelowTheWatermark() {
        Message seen = message(other, "will be read");
        message(me, "my own message"); // sent by me -> never unread for me
        message(other, "arrived after I looked");
        markReadUpTo(seen, me);
        em.flush();

        // Only the one that arrived after the watermark.
        assertEquals(1, messageRepository.countUnread(conversation.getId(), me.getId()));
        // The other participant has never looked, so my one message is unread for them.
        assertEquals(1, messageRepository.countUnread(conversation.getId(), other.getId()));
    }

    @Test
    void countUnreadTreatsNoWatermarkAsEverythingUnread() {
        message(other, "one");
        message(other, "two");
        em.flush();

        assertEquals(2, messageRepository.countUnread(conversation.getId(), me.getId()));
    }

    @Test
    void aWatermarkOnlyCoversItsOwnConversation() {
        User third = persistUser("third@example.com");
        PrivateConversation elsewhere = privateConversation(me, third);
        Message here = message(other, "here");
        message(elsewhere, "private", third, "somewhere else");
        markReadUpTo(here, me);
        em.flush();

        assertEquals(0, messageRepository.countUnread(conversation.getId(), me.getId()));
        assertEquals(1, messageRepository.countUnread(elsewhere.getId(), me.getId()));
    }

    @Test
    void unreadMentionsAreFoundAboveTheWatermarkAndForgottenBelowIt() {
        GroupConversation prayerGroup = group("Prayer", me, other);
        Message callsMeOut = message(prayerGroup, "group", other, "@me are you coming?");
        callsMeOut.setMentionedUserIds(Set.of(me.getId()));
        em.persist(callsMeOut);
        em.flush();

        assertEquals(List.of(prayerGroup.getId()),
                messageRepository.findConversationIdsWithUnreadMention(me.getId()));

        // Reading past it clears the marker; the mention is no longer waiting.
        markReadUpTo(callsMeOut, me);
        em.flush();
        assertTrue(messageRepository.findConversationIdsWithUnreadMention(me.getId()).isEmpty());
    }

    @Test
    void anAtAllMentionCountsWithoutNamingAnybody() {
        GroupConversation prayerGroup = group("Prayer", me, other);
        Message everyone = message(prayerGroup, "group", other, "@all service is moved");
        everyone.setMentionsEveryone(true);
        em.persist(everyone);
        em.flush();

        // @all is a flag, not a mention row per member — the church-wide group would
        // otherwise write one per person per message.
        assertTrue(everyone.getMentionedUserIds().isEmpty());
        assertEquals(List.of(prayerGroup.getId()),
                messageRepository.findConversationIdsWithUnreadMention(me.getId()));
    }

    @Test
    void yourOwnMentionOfSomebodyElseIsNotWaitingForYou() {
        GroupConversation prayerGroup = group("Prayer", me, other);
        Message mine = message(prayerGroup, "group", me, "@other over to you");
        mine.setMentionedUserIds(Set.of(other.getId()));
        em.persist(mine);
        em.flush();

        assertTrue(messageRepository.findConversationIdsWithUnreadMention(me.getId()).isEmpty());
        assertEquals(List.of(prayerGroup.getId()),
                messageRepository.findConversationIdsWithUnreadMention(other.getId()));
    }

    @Test
    void bulkConversationDeleteRemovesElementCollectionRowsFirst() {
        GroupConversation prayerGroup = group("Prayer", me, other);
        Message mentioned = message(prayerGroup, "group", other, "@me please pray");
        mentioned.setMentionedUserIds(Set.of(me.getId()));
        em.persist(mentioned);
        em.flush();

        messageRepository.deleteByConversationIdBulk(prayerGroup.getId());
        em.flush();

        Number messages = (Number) em.getEntityManager()
                .createNativeQuery("SELECT COUNT(*) FROM messages WHERE conversation_id = ?")
                .setParameter(1, prayerGroup.getId())
                .getSingleResult();
        Number mentions = (Number) em.getEntityManager()
                .createNativeQuery("SELECT COUNT(*) FROM message_mentions WHERE message_id = ?")
                .setParameter(1, mentioned.getId())
                .getSingleResult();
        assertEquals(0L, messages.longValue());
        assertEquals(0L, mentions.longValue());
    }

    @Test
    void senderScopedBulkDeleteLeavesOtherMessagesAndMentionsAlone() {
        GroupConversation prayerGroup = group("Prayer", me, other);
        Message mine = message(prayerGroup, "group", me, "@other mine");
        mine.setMentionedUserIds(Set.of(other.getId()));
        Message theirs = message(prayerGroup, "group", other, "@me theirs");
        theirs.setMentionedUserIds(Set.of(me.getId()));
        em.persist(mine);
        em.persist(theirs);
        em.flush();

        messageRepository.deleteByConversationIdAndSenderIdBulk(prayerGroup.getId(), me.getId());
        em.flush();

        assertTrue(messageRepository.findById(mine.getId()).isEmpty());
        assertTrue(messageRepository.findById(theirs.getId()).isPresent());
        Number remainingMention = (Number) em.getEntityManager()
                .createNativeQuery("SELECT COUNT(*) FROM message_mentions WHERE message_id = ? AND user_id = ?")
                .setParameter(1, theirs.getId())
                .setParameter(2, me.getId())
                .getSingleResult();
        assertEquals(1L, remainingMention.longValue());
    }

    @Test
    void deletingMentionReferencesForAUserKeepsMessagesAndOtherTargets() {
        User third = persistUser("third-mention@example.com");
        GroupConversation prayerGroup = group("Prayer", me, other, third);
        Message message = message(prayerGroup, "group", other, "@me @third");
        message.setMentionedUserIds(Set.of(me.getId(), third.getId()));
        em.persist(message);
        em.flush();

        assertEquals(1, messageRepository.deleteMentionReferencesByUserId(me.getId()));
        em.flush();

        assertTrue(messageRepository.findById(message.getId()).isPresent());
        Number targetCount = (Number) em.getEntityManager()
                .createNativeQuery("SELECT COUNT(*) FROM message_mentions WHERE message_id = ?")
                .setParameter(1, message.getId())
                .getSingleResult();
        assertEquals(1L, targetCount.longValue());
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
    void totalUnreadIgnoresOwnMessagesAndAnythingBelowTheWatermark() {
        message(me, "my own message");
        Message seen = message(other, "already seen");
        message(other, "still waiting");
        markReadUpTo(seen, me);
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
