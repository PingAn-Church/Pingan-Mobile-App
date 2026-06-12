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
    private String birthday;

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

    public String getBirthday() {
        return birthday;
    }

    public void setBirthday(String birthday) {
        this.birthday = birthday;
    }
}
