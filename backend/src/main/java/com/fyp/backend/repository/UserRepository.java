package com.fyp.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.User;

@Repository
public interface UserRepository extends JpaRepository<User, Long>, JpaSpecificationExecutor<User> {
    boolean existsByProfileImageContaining(String fragment);

    /** Active users, paginated — backs the directory picker's empty-query page. */
    Page<User> findByActiveTrue(Pageable pageable);

    Page<User> findByActiveTrueAndDeletedAccountFalse(Pageable pageable);

    /**
     * Name search over active users for the directory/chat pickers. Matches first,
     * last, or "first last"; email is intentionally not searchable to avoid enumeration.
     */
    @Query("SELECT u FROM User u WHERE u.active = true AND u.deletedAccount = false AND ("
            + " LOWER(u.firstName) LIKE LOWER(CONCAT('%', :q, '%'))"
            + " OR LOWER(u.lastName) LIKE LOWER(CONCAT('%', :q, '%'))"
            + " OR LOWER(CONCAT(u.firstName, ' ', u.lastName)) LIKE LOWER(CONCAT('%', :q, '%')) )")
    Page<User> searchActiveByName(@Param("q") String q, Pageable pageable);

    /** Verified + active users, paginated — backs the chat pickers' empty-query page. */
    Page<User> findByActiveTrueAndDeletedAccountFalseAndIsVerifiedUserTrue(Pageable pageable);

    /**
     * Name search over active, admin-verified users for the chat pickers. Matches
     * first, last, or "first last"; email is intentionally not searchable (no
     * enumeration). Unverified users are hidden — they can't use chat until approved.
     */
    @Query("SELECT u FROM User u WHERE u.active = true AND u.deletedAccount = false AND u.isVerifiedUser = true AND ("
            + " LOWER(u.firstName) LIKE LOWER(CONCAT('%', :q, '%'))"
            + " OR LOWER(u.lastName) LIKE LOWER(CONCAT('%', :q, '%'))"
            + " OR LOWER(CONCAT(u.firstName, ' ', u.lastName)) LIKE LOWER(CONCAT('%', :q, '%')) )")
    Page<User> searchActiveVerifiedByName(@Param("q") String q, Pageable pageable);

    /**
     * Find a user by their email address.
     *
     * @param email The email of the user.
     * @return An Optional containing the User, if found.
     */
    Optional<User> findByEmail(String email);

    List<User> findByEmailIn(Collection<String> emails);

    /**
     * The app language this user's device last reported, for composing push text.
     * Projected on its own so the fan-out does not load a whole User per recipient;
     * empty when the user has never reported one.
     */
    @Query("SELECT u.language FROM User u WHERE u.id = :id")
    Optional<String> findLanguageById(@Param("id") Long id);

    List<User> findByIsVerifiedUserTrue();

    List<User> findByIsVerifiedUserTrueAndDeletedAccountFalse();

    List<User> findByIsAdminTrue();

    List<User> findByIsAdminTrueAndDeletedAccountFalse();

    List<User> findByIsInstructorTrue();

    List<User> findByIsInstructorTrueAndDeletedAccountFalse();

    List<User> findByActiveFalse();

    List<User> findByActiveFalseAndDeletedAccountFalse();

    Long countByIsAdminTrue();

    Long countByIsAdminTrueAndDeletedAccountFalse();
}
