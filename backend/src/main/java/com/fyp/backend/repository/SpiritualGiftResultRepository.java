package com.fyp.backend.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.fyp.backend.model.SpiritualGiftResult;

public interface SpiritualGiftResultRepository extends JpaRepository<SpiritualGiftResult, Long> {

    Optional<SpiritualGiftResult> findByUserId(Long userId);

    void deleteByUserId(Long userId);
}
