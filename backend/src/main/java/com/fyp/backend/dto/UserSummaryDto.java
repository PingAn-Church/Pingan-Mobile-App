package com.fyp.backend.dto;

import com.fyp.backend.model.User;

/**
 * Minimal, public-facing user info for directory search and chat pickers.
 * Deliberately excludes email and other PII so any authenticated user can search
 * without exposing contact details (the full {@link UserProfileDto} stays admin-only).
 */
public class UserSummaryDto {

    private Long id;
    private String firstName;
    private String lastName;
    private String profileImage;
    private boolean isInstructor;
    private boolean isAdmin;
    private boolean isVerifiedUser;

    public static UserSummaryDto from(User user) {
        UserSummaryDto dto = new UserSummaryDto();
        dto.id = user.getId();
        dto.firstName = user.getFirstName();
        dto.lastName = user.getLastName();
        dto.profileImage = user.getProfileImage();
        dto.isInstructor = user.isInstructor();
        dto.isAdmin = user.isAdmin();
        dto.isVerifiedUser = user.isVerifiedUser();
        return dto;
    }

    public Long getId() {
        return id;
    }

    public String getFirstName() {
        return firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public String getProfileImage() {
        return profileImage;
    }

    public boolean isInstructor() {
        return isInstructor;
    }

    public boolean isAdmin() {
        return isAdmin;
    }

    public boolean isVerifiedUser() {
        return isVerifiedUser;
    }
}
