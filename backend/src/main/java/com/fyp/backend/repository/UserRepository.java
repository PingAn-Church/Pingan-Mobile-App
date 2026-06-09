package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.User;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * Find a user by their email address.
     *
     * @param email The email of the user.
     * @return An Optional containing the User, if found.
     */
    Optional<User> findByEmail(String email);

    List<User> findByIsVerifiedUserTrue();

    List<User> findByIsAdminTrue();

    List<User> findByIsInstructorTrue();

    Long countByIsAdminTrue();
}
