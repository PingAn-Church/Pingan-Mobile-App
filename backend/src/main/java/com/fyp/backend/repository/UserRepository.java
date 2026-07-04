package com.fyp.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.User;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

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

    /**
     * Find a user by their email address.
     *
     * @param email The email of the user.
     * @return An Optional containing the User, if found.
     */
    Optional<User> findByEmail(String email);

    List<User> findByEmailIn(Collection<String> emails);

    List<User> findByIsVerifiedUserTrue();

    List<User> findByIsVerifiedUserTrueAndDeletedAccountFalse();

    List<User> findByIsAdminTrue();

    List<User> findByIsAdminTrueAndDeletedAccountFalse();

    List<User> findByIsInstructorTrue();

    List<User> findByIsInstructorTrueAndDeletedAccountFalse();

    List<User> findByActiveFalse();

    List<User> findByActiveFalseAndDeletedAccountFalse();

    List<User> findByDeletedAccountTrueOrderByDeletedAtDescIdAsc();

    Long countByIsAdminTrue();

    Long countByIsAdminTrueAndDeletedAccountFalse();
}
