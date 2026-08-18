package com.fyp.backend.model;

import java.time.Instant;

import org.hibernate.annotations.ColumnDefault;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "users")
@Data // Generates getters, setters, toString, equals, and hashCode
@NoArgsConstructor // Generates a no-args constructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String firstName;

    @Column(nullable = false)
    private String lastName;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String password;

    @Column
    private String profileImage; // New column to store the profile image URL

    @Column(nullable = false)
    private boolean isVerifiedUser;

    @Column(nullable = false)
    private boolean isAdmin;

    // E-learning: course author / instructor privileges (admins are inclusively instructors)
    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean isInstructor = false;

    // Soft-delete flag. Inactive accounts are blocked from logging in and hidden
    // from the user/role listings, but their data is retained so an admin can
    // reactivate them.
    @ColumnDefault("true")
    @Column(nullable = false)
    private boolean active = true;

    // Irreversible self-deletion marker used while account cleanup and audit
    // checks complete. This app deletes the user's Chat/Thread content instead
    // of retaining shared UGC through this row.
    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean deletedAccount = false;

    @Column
    private Instant deletedAt;

    // E-learning: gamification credits balance
    @ColumnDefault("0")
    @Column(nullable = false)
    private Integer points = 0;

    @Column
    private String birthday;

    @Column
    private String bio;

    @Column
    private String location;

    @Column
    private String phone;

    // App language last reported by this user's device ("en" / "zh"). The server
    // composes push notification text, which the recipient never gets to see
    // translated client-side, so it needs to know which locale to write in.
    // Null for users who have not been seen since this was introduced.
    @Column(length = 8)
    private String language;

    // How far this admin has read down the list of new sign-ups: the highest
    // user id they have already been shown. Everything above it is what the
    // "new members" badge counts. Only ever set for admins.
    //
    // Null means "has not looked yet", which is deliberately NOT treated as
    // "everything is new" — an admin who installs this build should not be
    // greeted by a badge counting the entire membership. The first read stamps
    // the current high-water mark and reports nothing outstanding, so only
    // genuinely later registrations ever raise the badge.
    @Column
    private Long lastSeenMemberId;

    /**
     * Machine account — the in-app assistant, not a person.
     *
     * It is a real user row so that messages, fan-out, avatars, history and
     * reporting all work unchanged; this flag is what keeps it out of the places
     * a person belongs: login, the member directory, the new-member badge and
     * account deletion. It is deliberately NOT excluded from
     * {@code findChatEligibleMembers} — the assistant has to stay on the
     * app-level group's roster or its mentions are stripped before they are ever
     * stored. See AssistantAccountService.
     */
    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean bot = false;

    /**
     * Chinese display name, shown to readers whose app language is Chinese.
     *
     * Null for people — a member has one name and everyone sees it. Only the
     * assistant is named in both languages, the same way the app-level group is
     * (see GroupConversation.groupNameZh).
     */
    @Column
    private String displayNameZh;
}
