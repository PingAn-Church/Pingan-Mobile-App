package com.fyp.backend.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.fyp.backend.model.Others;

public interface OthersRepository extends JpaRepository<Others, Long> {
    Optional<Others> findByName(String name);
}

