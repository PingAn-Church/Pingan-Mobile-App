package com.fyp.backend.repository;

import com.fyp.backend.model.PushToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface PushTokenRepository extends JpaRepository<PushToken, Long> {
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PushToken p
               set p.isActive = false
             where p.isActive = true
               and not exists (
                   select r.id
                     from RefreshToken r
                    where r.userEmail = p.user.email
                      and r.deviceId = p.deviceId
                      and r.expiresAt > :now
               )
            """)
    int deactivateWithoutValidRefreshToken(@Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PushToken p
               set p.isActive = false
             where p.isActive = true
               and p.user.email = :email
               and p.deviceId = :deviceId
            """)
    int deactivateByUserEmailAndDeviceId(@Param("email") String email,
                                         @Param("deviceId") String deviceId);

    Optional<PushToken> findByUserIdAndTokenAndDeviceId(Long userId, String token, String deviceId);
    List<PushToken> findByUserIdAndDeviceId(Long userId, String deviceId);
    Optional<PushToken> findByUserIdAndToken(Long userId, String token);
    List<PushToken> findByUserId(Long userId);
    long countByUserId(Long userId);
    void deleteByUserIdAndToken(Long userId, String token);
    void deleteByUserIdAndTokenAndDeviceId(Long userId, String token, String deviceId);
    void deleteByUserId(Long userId);
}
