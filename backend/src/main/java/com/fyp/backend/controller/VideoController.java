package com.fyp.backend.controller;

import java.util.List;
import java.util.logging.Logger;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.model.Video;
import com.fyp.backend.service.VideoService;

@RestController
@RequestMapping("/api/videos")
public class VideoController {

    private final VideoService videoService;
    private static final Logger logger = Logger.getLogger(VideoController.class.getName());

    public VideoController(VideoService videoService) {
        this.videoService = videoService;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/add")
    public ResponseEntity<?> addVideo(@RequestBody Video video) {
        try {
            Video savedVideo = videoService.saveVideo(video);
            return ResponseEntity.ok(savedVideo);
        } catch (Exception e) {
            logger.severe("Error saving video: " + e.getMessage());
            return ResponseEntity.status(500).body("Error saving video");
        }
    }

    @GetMapping("/list")
    public ResponseEntity<List<Video>> getAllVideos() {
        return ResponseEntity.ok(videoService.getAllVideos());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteVideo(@PathVariable Long id) {
        try {
            videoService.deleteVideo(id);
            return ResponseEntity.ok("Video deleted successfully");
        } catch (Exception e) {
            logger.severe("Error deleting video: " + e.getMessage());
            return ResponseEntity.status(500).body("Error deleting video");
        }
    }
}