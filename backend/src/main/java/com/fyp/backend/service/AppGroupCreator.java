package com.fyp.backend.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.repository.GroupConversationRepository;

import lombok.RequiredArgsConstructor;

/** Creates the singleton app-level group in an independently retryable transaction. */
@Service
@RequiredArgsConstructor
public class AppGroupCreator {

    private static final Logger log = LoggerFactory.getLogger(AppGroupCreator.class);

    private final GroupConversationRepository groupConversationRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void createIfMissing() {
        if (groupConversationRepository.findFirstByAppLevelTrue().isPresent()) return;

        Timestamp now = Timestamp.from(Instant.now());
        GroupConversation group = new GroupConversation();
        group.setAppLevel(true);
        group.setGroupName(AppGroupChatService.DEFAULT_NAME_EN);
        group.setGroupNameZh(AppGroupChatService.DEFAULT_NAME_ZH);
        group.setParticipants(new ArrayList<>());
        group.setAdmins(new ArrayList<>());
        group.setCreatedAt(now);
        group.setUpdatedAt(now);

        GroupConversation saved = groupConversationRepository.saveAndFlush(group);
        log.info("Created the app-level group chat (conversation #{}).", saved.getId());
    }
}
