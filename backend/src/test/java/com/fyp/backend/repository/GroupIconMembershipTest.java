package com.fyp.backend.repository;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Timestamp;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.TestPropertySource;

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.User;

/**
 * The group icon name is the only handle older clients give us when asking to
 * download a group avatar, so resolving membership through it must be exactly as
 * strict as resolving it through a conversation id. Names arrive LIKE-escaped
 * from ConversationService, so the fixtures use the escaped form.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@TestPropertySource(properties = "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect")
class GroupIconMembershipTest {

    @Autowired private GroupConversationRepository groupConversationRepository;
    @Autowired private UserRepository userRepository;

    private User user(String email) {
        User user = new User();
        user.setEmail(email);
        user.setFirstName("A");
        user.setLastName("B");
        user.setPassword("x");
        return userRepository.save(user);
    }

    private GroupConversation group(String icon, User... participants) {
        GroupConversation group = new GroupConversation();
        group.setGroupName("g");
        group.setGroupIcon(icon);
        group.setParticipants(List.of(participants));
        group.setCreatedAt(new Timestamp(System.currentTimeMillis()));
        group.setUpdatedAt(new Timestamp(System.currentTimeMillis()));
        return groupConversationRepository.save(group);
    }

    @Test
    void participantResolvesTheirOwnGroupIcon() {
        User member = user("member@example.com");
        group("https://cdn.example.com/groupProfilePictures/u1_team_abc123.jpg", member);

        assertTrue(groupConversationRepository
                .isParticipantOfGroupWithIcon(member.getId(), "u1!_team!_abc123.jpg"));
    }

    @Test
    void outsiderCannotResolveSomeoneElsesGroupIcon() {
        User member = user("member2@example.com");
        User outsider = user("outsider@example.com");
        group("https://cdn.example.com/groupProfilePictures/u1_secret_def456.jpg", member);

        assertFalse(groupConversationRepository
                .isParticipantOfGroupWithIcon(outsider.getId(), "u1!_secret!_def456.jpg"));
    }

    @Test
    void unknownIconResolvesToNothing() {
        User member = user("member3@example.com");
        group("https://cdn.example.com/groupProfilePictures/u1_team_ghi789.jpg", member);

        assertFalse(groupConversationRepository
                .isParticipantOfGroupWithIcon(member.getId(), "not!_an!_icon.jpg"));
    }
}
