package com.fyp.backend.model;

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
}
