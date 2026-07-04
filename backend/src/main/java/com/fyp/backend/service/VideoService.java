package com.fyp.backend.service;

import com.fyp.backend.model.Video;
import com.fyp.backend.repository.VideoRepository;
import org.springframework.stereotype.Service;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

@Service
public class VideoService {

    private final VideoRepository videoRepository;

    public VideoService(VideoRepository videoRepository) {
        this.videoRepository = videoRepository;
    }

    public Video saveVideo(Video video) {
        return videoRepository.save(video);
    }

    public Page<Video> getVideos(Pageable pageable) {
        return videoRepository.findAll(pageable);
    }

    public void deleteVideo(Long id) {
        videoRepository.deleteById(id);
    }
}
