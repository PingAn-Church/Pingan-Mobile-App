package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private JwtUtil jwtUtil;
    @Mock private RedisService redisService;
    @Mock private AdminAlertService adminAlertService;
    @Mock private AppGroupChatService appGroupChatService;

    @InjectMocks private UserService userService;

    private User user(boolean admin) {
        User u = new User();
        u.setId(7L);
        u.setAdmin(admin);
        u.setActive(true);
        return u;
    }

    @Test
    void updateAdminStatusDoesNotTreatNonAdminNoopAsLastAdminRemoval() {
        User target = user(false);
        when(userRepository.findById(7L)).thenReturn(Optional.of(target));
        when(userRepository.countByIsAdminTrue()).thenReturn(1L);

        userService.updateUserAdminStatus(7L, false);

        assertFalse(target.isAdmin());
        verify(userRepository).save(target);
    }

    @Test
    void updateAdminStatusStillRejectsRemovingOnlyAdmin() {
        User target = user(true);
        when(userRepository.findById(7L)).thenReturn(Optional.of(target));
        when(userRepository.countByIsAdminTrue()).thenReturn(1L);

        assertThrows(UserService.LastAdminException.class,
                () -> userService.updateUserAdminStatus(7L, false));
    }
}
