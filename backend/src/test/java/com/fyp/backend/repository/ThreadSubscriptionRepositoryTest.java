package com.fyp.backend.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.TestPropertySource;

import com.fyp.backend.model.Thread;
import com.fyp.backend.model.ThreadSubscription;
import com.fyp.backend.model.User;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@TestPropertySource(properties = "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect")
class ThreadSubscriptionRepositoryTest {

    @Autowired private ThreadSubscriptionRepository repository;
    @Autowired private TestEntityManager em;

    @Test
    void bulkDeleteByUserLeavesOtherSubscribersIntact() {
        User author = user("topic-author@example.com");
        User leaving = user("topic-leaving@example.com");
        Thread thread = new Thread();
        thread.setTitle("Topic");
        thread.setContent("Body");
        thread.setCreatedAt(LocalDateTime.now());
        thread.setCreatedBy(author);
        thread = em.persist(thread);
        em.persist(new ThreadSubscription(thread.getId(), author.getId(), null));
        em.persist(new ThreadSubscription(thread.getId(), leaving.getId(), null));
        em.flush();

        assertEquals(1, repository.deleteByUserId(leaving.getId()));
        em.flush();

        assertEquals(1, repository.findByThreadId(thread.getId()).size());
        assertEquals(author.getId(), repository.findByThreadId(thread.getId()).get(0).getUserId());
    }

    private User user(String email) {
        User user = new User();
        user.setFirstName("F");
        user.setLastName("L");
        user.setEmail(email);
        user.setPassword("hash");
        user.setActive(true);
        return em.persist(user);
    }
}
