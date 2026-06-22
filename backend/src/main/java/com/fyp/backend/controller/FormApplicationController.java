package com.fyp.backend.controller;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.model.FormApplication;
import com.fyp.backend.repository.FormApplicationRepository;

@RestController
@RequestMapping("/api/applications")
public class FormApplicationController {

    @Autowired
    private FormApplicationRepository formApplicationRepository;

    // Save an application (any authenticated user)
    @PostMapping
    public ResponseEntity<FormApplication> createApplication(@RequestBody FormApplication application) {
        application.setSubmittedAt(java.time.LocalDateTime.now()); // Ensure timestamp is set
        return ResponseEntity.ok(formApplicationRepository.save(application));
    }

    // Get applications — personal data, admins only; paginated, newest-first.
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping
    public ResponseEntity<Map<String, Object>> getAllApplications(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        int safeSize = Math.min(Math.max(size, 1), 50);
        int safePage = Math.max(page, 0);
        Page<FormApplication> result = formApplicationRepository.findAll(
                PageRequest.of(safePage, safeSize, Sort.by(Sort.Direction.DESC, "submittedAt")));

        Map<String, Object> pagination = new LinkedHashMap<>();
        pagination.put("page", safePage);
        pagination.put("size", safeSize);
        pagination.put("totalCount", result.getTotalElements());
        pagination.put("hasMore", result.hasNext());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("data", result.getContent());
        body.put("pagination", pagination);
        return ResponseEntity.ok(body);
    }

    // Get a specific application by ID — admins only
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/{id}")
    public ResponseEntity<FormApplication> getApplicationById(@PathVariable Long id) {
        return formApplicationRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
