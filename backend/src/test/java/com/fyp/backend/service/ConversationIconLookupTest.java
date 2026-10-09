package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fyp.backend.repository.GroupConversationRepository;

/**
 * The icon lookup feeds a SQL LIKE. A '%' would match every group the caller
 * belongs to, and an unescaped '_' would match icons it does not actually name —
 * both would hand out a signed URL for an object the caller never identified.
 */
@ExtendWith(MockitoExtension.class)
class ConversationIconLookupTest {

    @Mock private GroupConversationRepository groupConversationRepository;

    private ConversationService service() {
        return new ConversationService(groupConversationRepository, null, null, null,
                null, null, null, null, null, null, null, null, null);
    }

    @Test
    void namesThatArentRealObjectNamesNeverReachTheDatabase() {
        for (String probe : new String[] { "%", "%.jpg", "a%b.jpg", "!", "", "a/b.jpg" }) {
            assertFalse(service().isUserInGroupWithIcon(probe, 7L), probe);
        }
        assertFalse(service().isUserInGroupWithIcon(null, 7L));
        assertFalse(service().isUserInGroupWithIcon("icon.jpg", null));
        verifyNoInteractions(groupConversationRepository);
    }

    @Test
    void underscoresAreEscapedRatherThanTreatedAsWildcards() {
        when(groupConversationRepository
                .isParticipantOfGroupWithIcon(7L, "u1!_team!_abc.jpg")).thenReturn(true);

        assertTrue(service().isUserInGroupWithIcon("u1_team_abc.jpg", 7L));

        verify(groupConversationRepository).isParticipantOfGroupWithIcon(7L, "u1!_team!_abc.jpg");
    }
}
