package com.fyp.backend.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.TestPropertySource;

import com.fyp.backend.model.User;

/**
 * Repository query tests for the directory search/privacy work, run against an
 * in-memory H2 database (no Docker / external services).
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@TestPropertySource(properties = "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect")
class UserRepositoryTest {

    @Autowired private UserRepository userRepository;
    @Autowired private TestEntityManager em;

    private User user(String first, String last, String email, boolean active) {
        User u = new User();
        u.setFirstName(first);
        u.setLastName(last);
        u.setEmail(email);
        u.setPassword("hash");
        u.setActive(active);
        return em.persist(u);
    }

    @Test
    void searchMatchesNameAndExcludesInactiveAccounts() {
        user("Alice", "Wong", "alice@example.com", true);
        user("Bob", "Wong", "bob@example.com", true);
        user("Carol", "Tan", "carol@example.com", false); // inactive
        em.flush();

        assertEquals(2, userRepository.searchActiveByName("wong", PageRequest.of(0, 10)).getTotalElements());
        assertEquals(1, userRepository.searchActiveByName("ali", PageRequest.of(0, 10)).getTotalElements());
        // full-name match works too
        assertEquals(1, userRepository.searchActiveByName("bob wong", PageRequest.of(0, 10)).getTotalElements());
        // inactive accounts never surface, even on a name match
        assertEquals(0, userRepository.searchActiveByName("tan", PageRequest.of(0, 10)).getTotalElements());
    }

    @Test
    void findByActiveTruePaginatesActiveUsersOnly() {
        for (int i = 0; i < 5; i++) {
            user("User" + i, "L", "u" + i + "@example.com", true);
        }
        user("Gone", "Away", "inactive@example.com", false);
        em.flush();

        Page<User> page = userRepository.findByActiveTrue(PageRequest.of(0, 2));
        assertEquals(5, page.getTotalElements());
        assertEquals(2, page.getContent().size());
        assertTrue(page.hasNext());
    }

    @Test
    void findByEmailInReturnsOnlyKnownEmails() {
        user("A", "A", "a@example.com", true);
        user("B", "B", "b@example.com", true);
        em.flush();

        List<User> found = userRepository.findByEmailIn(List.of("a@example.com", "missing@example.com"));
        assertEquals(1, found.size());
        assertEquals("a@example.com", found.get(0).getEmail());
    }
}
