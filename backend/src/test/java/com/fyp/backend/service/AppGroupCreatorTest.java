package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.repository.GroupConversationRepository;

@ExtendWith(MockitoExtension.class)
class AppGroupCreatorTest {

    @Mock private GroupConversationRepository repository;
    @InjectMocks private AppGroupCreator creator;

    @Test
    void createsTheSingletonWithBothSeedNames() {
        when(repository.findFirstByAppLevelTrue()).thenReturn(Optional.empty());
        when(repository.saveAndFlush(any(GroupConversation.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        creator.createIfMissing();

        ArgumentCaptor<GroupConversation> saved = ArgumentCaptor.forClass(GroupConversation.class);
        verify(repository).saveAndFlush(saved.capture());
        assertTrue(saved.getValue().isAppLevel());
        assertEquals(AppGroupChatService.DEFAULT_NAME_EN, saved.getValue().getGroupName());
        assertEquals(AppGroupChatService.DEFAULT_NAME_ZH, saved.getValue().getGroupNameZh());
    }
}
