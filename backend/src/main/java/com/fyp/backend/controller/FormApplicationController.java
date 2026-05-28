package com.fyp.backend.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.model.FormApplication;
import com.fyp.backend.repository.FormApplicationRepository;

@RestController
@RequestMapping("/api/applications")
public class FormApplicationController {

    @Autowired
    private FormApplicationRepository formApplicationRepository;

    // Save an application
    @PostMapping
    public ResponseEntity<FormApplication> createApplication(@RequestBody FormApplication application) {
        application.setSubmittedAt(java.time.LocalDateTime.now()); // Ensure timestamp is set
        return ResponseEntity.ok(formApplicationRepository.save(application));
    }

    // Get all applications
    @GetMapping
    public ResponseEntity<List<FormApplication>> getAllApplications() {
        return ResponseEntity.ok(formApplicationRepository.findAll());
    }

    // Get a specific application by ID
    @GetMapping("/{id}")
    public ResponseEntity<FormApplication> getApplicationById(@PathVariable Long id) {
        return formApplicationRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
