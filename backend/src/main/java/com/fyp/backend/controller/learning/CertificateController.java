package com.fyp.backend.controller.learning;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.ApiResponse;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.User;
import com.fyp.backend.service.CertificateService;
import com.fyp.backend.service.UserService;

/**
 * Read access to a learner's completion certificates. A user may only read
 * their own certificates (admins may read anyone's).
 */
@RestController
@RequestMapping("/api/fn")
public class CertificateController {

    @Autowired private CertificateService certificateService;
    @Autowired private UserService userService;

    @GetMapping("/getCertificates")
    public ApiResponse<List<Map<String, Object>>> getMyCertificates(@RequestHeader("Authorization") String auth) {
        return ApiResponse.ok(certificateService.getCertificates(currentUser(auth).getId()));
    }

    @GetMapping("/getCertificates/{userId}")
    public ApiResponse<List<Map<String, Object>>> getCertificates(@RequestHeader("Authorization") String auth,
            @PathVariable Long userId) {
        User me = currentUser(auth);
        if (!me.getId().equals(userId) && !me.isAdmin()) {
            throw ApiException.forbidden("Cannot view another user's certificates");
        }
        return ApiResponse.ok(certificateService.getCertificates(userId));
    }

    private User currentUser(String auth) {
        return userService.getUserFromToken(auth)
                .orElseThrow(() -> ApiException.unauthorized("Not authenticated"));
    }
}
