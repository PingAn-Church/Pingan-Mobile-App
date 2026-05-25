package com.fyp.backend.repository;

import com.fyp.backend.model.ThreadReply;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ThreadReplyRepository extends JpaRepository<ThreadReply, Long> {
    List<ThreadReply> findByThreadId(Long threadId);
}
