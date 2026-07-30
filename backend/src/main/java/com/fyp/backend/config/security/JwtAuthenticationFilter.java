package com.fyp.backend.config.security;

import com.fyp.backend.model.User;
import com.fyp.backend.model.security.CustomUserDetails;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Optional;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger LOGGER = LoggerFactory.getLogger(JwtAuthenticationFilter.class);
    private static final String BEARER_PREFIX = "Bearer ";
    private static final String USER_ROLE = "USER";
    private static final String AUTHORIZATION_HEADER = "Authorization";

    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;

    public JwtAuthenticationFilter(UserRepository userRepository, JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.jwtUtil = jwtUtil;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String requestUri = request.getRequestURI();
        String contextPath = request.getContextPath();
        String logoutPath = (contextPath == null ? "" : contextPath) + "/auth/logout";
        return logoutPath.equals(requestUri);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        // ✅ Skip authentication if already set (Avoids redundant processing)
        if (SecurityContextHolder.getContext().getAuthentication() != null) {
            LOGGER.debug("✅ Skipping authentication - already set for request: {}", request.getRequestURI());
            chain.doFilter(request, response);
            return;
        }

        String jwt = extractJwtFromRequest(request);
        if (jwt == null) {
            chain.doFilter(request, response);
            return;
        }

        String email = jwtUtil.extractEmail(jwt);

        if (email == null) {
            LOGGER.warn("❌ Invalid or expired JWT token on request to {}", request.getRequestURI());
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid token");
            return;
        }
        if (!authenticateUser(email, jwt, request, response)) {
            return;
        }

        chain.doFilter(request, response);
    }

    /**
     * Extracts JWT token from the Authorization header.
     */
    private String extractJwtFromRequest(HttpServletRequest request) {
        String authorizationHeader = request.getHeader(AUTHORIZATION_HEADER);
        if (authorizationHeader != null && authorizationHeader.startsWith(BEARER_PREFIX)) {
            return authorizationHeader.substring(BEARER_PREFIX.length());
        }
        return null;
    }

    /**
     * Authenticates the user based on the JWT token.
     */
    private boolean authenticateUser(String email, String jwt, HttpServletRequest request, HttpServletResponse response)
            throws IOException {

        Optional<User> userOptional = userRepository.findByEmail(email);

        if (userOptional.isEmpty()) {
            LOGGER.warn("❌ User not found: {}", email);
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "User not found");
            return false;
        }

        User user = userOptional.get();

        if (!user.isActive() || user.isDeletedAccount()) {
            LOGGER.warn("❌ Disabled account attempted to use an access token: {}", email);
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Account is disabled");
            return false;
        }

        if (!jwtUtil.validateToken(jwt, user.getEmail())) {
            LOGGER.warn("❌ Invalid JWT token for user: {}", email);
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid token");
            return false;
        }

        // ✅ Skip re-authentication if user is already set in SecurityContext
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            setAuthentication(user, request);
        }
        return true;
    }

    /**
     * Sets authentication details for the user in the SecurityContext.
     */
    private void setAuthentication(User user, HttpServletRequest request) {
        UserDetails userDetails = new CustomUserDetails(user);

        UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                userDetails, null, userDetails.getAuthorities());

        authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

        SecurityContextHolder.getContext().setAuthentication(authToken);
        LOGGER.info("✅ Authenticated {} with roles {}", user.getEmail(), userDetails.getAuthorities());
    }
}
