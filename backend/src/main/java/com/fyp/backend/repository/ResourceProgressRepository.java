package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.ResourceProgress;

@Repository
public interface ResourceProgressRepository extends JpaRepository<ResourceProgress, Long> {
    Optional<ResourceProgress> findByUserIdAndResourceId(Long userId, Long resourceId);

    List<ResourceProgress> findByUserIdAndResourceIdIn(Long userId, List<Long> resourceIds);

    long countByUserIdAndResourceIdInAndIsCompletedTrue(Long userId, List<Long> resourceIds);

    void deleteByResourceIdIn(List<Long> resourceIds);
}
