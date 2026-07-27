//package com.fyp.backend.dto;
//
//import lombok.Data;
//
//@Data
//public class UserProfileDto {
//
//    private Long id;
//    private String firstName;
//    private String lastName;
//    private String email;
//
//    public UserProfileDto(Long id, String firstName, String lastName, String email) {
//        this.id = id;
//        this.firstName = firstName;
//        this.lastName = lastName;
//        this.email = email;
//    }
//}

package com.fyp.backend.dto;

import java.time.Instant;

import com.fyp.backend.model.User;

public class UserProfileDto {

    private Long id;
    private String firstName;
    private String lastName;
    private String email;
    private String profileImage;
    private boolean isVerifiedUser;
    private boolean isAdmin;
    private boolean isInstructor;
    private boolean deletedAccount;
    private Instant deletedAt;
    private String birthday;
    private String language;

    public UserProfileDto(Long id, String firstName, String lastName, String email, String profileImage,
            boolean isVerifiedUser, boolean isAdmin, String birthday) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.profileImage = profileImage;
        this.isVerifiedUser = isVerifiedUser;
        this.isAdmin = isAdmin;
        this.birthday = birthday;
    }

    /**
     * Builds a full profile DTO including the e-learning instructor flag.
     * Prefer this over the constructor so new role fields stay in one place.
     */
    public static UserProfileDto from(User user) {
        if (user.isDeletedAccount()) {
            UserProfileDto dto = new UserProfileDto(
                    user.getId(),
                    "Deleted",
                    "Account",
                    null,
                    null,
                    false,
                    false,
                    null);
            dto.isInstructor = false;
            dto.deletedAccount = true;
            dto.deletedAt = user.getDeletedAt();
            return dto;
        }

        UserProfileDto dto = new UserProfileDto(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getProfileImage(),
                user.isVerifiedUser(),
                user.isAdmin(),
                user.getBirthday());
        dto.isInstructor = user.isInstructor();
        dto.deletedAccount = false;
        dto.deletedAt = user.getDeletedAt();
        dto.language = user.getLanguage();
        return dto;
    }

    // Getters and setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getProfileImage() {
        return profileImage;
    }

    public void setProfileImage(String profileImage) {
        this.profileImage = profileImage;
    }

    public boolean isVerifiedUser() {
        return isVerifiedUser;
    }

    public void setVerifiedUser(Boolean isVerifiedUser) {
        this.isVerifiedUser = isVerifiedUser;
    }

    public boolean isAdmin() {
        return isAdmin;
    }

    public void setAdmin(Boolean isAdmin) {
        this.isAdmin = isAdmin;
    }

    public boolean isInstructor() {
        return isInstructor;
    }

    public void setInstructor(Boolean isInstructor) {
        this.isInstructor = isInstructor;
    }

    public boolean isDeletedAccount() {
        return deletedAccount;
    }

    public void setDeletedAccount(boolean deletedAccount) {
        this.deletedAccount = deletedAccount;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }

    public void setDeletedAt(Instant deletedAt) {
        this.deletedAt = deletedAt;
    }

    public String getBirthday() {
        return birthday;
    }

    public void setBirthday(String birthday) {
        this.birthday = birthday;
    }

    /** App language last reported by this user's device; drives push text. */
    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language;
    }
}
