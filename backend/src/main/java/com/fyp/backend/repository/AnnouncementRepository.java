package com.fyp.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.Announcement;

@Repository
public interface AnnouncementRepository extends JpaRepository<Announcement, Long> {}
