package com.fyp.backend.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.TestPropertySource;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@TestPropertySource(properties = "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect")
class ConversationReadStateRepositoryTest {

    @Autowired private ConversationReadStateRepository repository;
    @Autowired private TestEntityManager em;

    @Test
    void h2FallbackCreatesAndOnlyAdvancesTheWatermark() {
        assertEquals(1, repository.advanceWatermark(7L, 3L, 120L));
        assertEquals(120L, repository.findByConversationIdAndUserId(7L, 3L)
                .orElseThrow().getLastReadMessageId());

        repository.advanceWatermark(7L, 3L, 40L);
        em.clear();
        assertEquals(120L, repository.findByConversationIdAndUserId(7L, 3L)
                .orElseThrow().getLastReadMessageId());

        repository.advanceWatermark(7L, 3L, 180L);
        em.clear();
        assertEquals(180L, repository.findByConversationIdAndUserId(7L, 3L)
                .orElseThrow().getLastReadMessageId());
    }
}
