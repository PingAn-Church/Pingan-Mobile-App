package com.fyp.backend.controller;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.model.Others;
import com.fyp.backend.service.OthersService;

@RestController
@RequestMapping("/api/others")
public class OthersController {
    @Autowired
    private OthersService othersService;

    @GetMapping("/{name}")
    public ResponseEntity<Others> getOthers(@PathVariable String name) {
        return ResponseEntity.ok(othersService.getOthersByName(name));
    }

    @GetMapping("/all")
    public ResponseEntity<List<Others>> getAllSections() {
        return ResponseEntity.ok(othersService.getAllSections());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/update/{name}")
    public ResponseEntity<Others> updateOthers(@PathVariable String name, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(othersService.updateOthers(name, body.get("content")));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/create")
    public ResponseEntity<Others> createOthers(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(othersService.createOthers(body.get("name"), body.get("content")));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/delete/{name}")
    public ResponseEntity<Void> deleteOthers(@PathVariable String name) {
        othersService.deleteOthers(name);
        return ResponseEntity.noContent().build();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/rename/{oldName}")
    public ResponseEntity<Others> renameOthers(@PathVariable String oldName, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(othersService.renameOthers(oldName, body.get("newName")));
    }

}
