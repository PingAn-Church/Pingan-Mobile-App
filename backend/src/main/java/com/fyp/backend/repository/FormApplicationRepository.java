package com.fyp.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.fyp.backend.model.FormApplication;

public interface FormApplicationRepository extends JpaRepository<FormApplication, Long> {
}