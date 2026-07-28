package com.fyp.backend.config.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SpringSecurityConfig {

    @Autowired
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @Bean
    public static PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> {
                }) // ✅ NEW: enable CORS rules from WebConfig
                .authorizeHttpRequests((authorize) -> authorize
                        // Public read-only homepage/catalog content.
                        .requestMatchers(HttpMethod.GET, "/api/videos/**", "/api/announcements/**")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET,
                                "/api/fn/getAllPublishedCourse",
                                "/api/fn/categoryHandler",
                                "/api/fn/getModuleDetail/**",
                                "/api/fn/getCourseReviews/**")
                        .permitAll()
                        // Media gateway: authorization is the HMAC-signed query on each URL
                        // (MediaTokenService) — image/audio loaders can't send JWT headers.
                        .requestMatchers(HttpMethod.GET, "/media/**").permitAll()
                        // Public course/announcement media has a narrow signing endpoint.
                        // Private download signing, object listing and deletion stay login-gated.
                        .requestMatchers(HttpMethod.GET, "/oss/public-download-url")
                        .permitAll()
                        // Registration may upload an optional profile image before login;
                        // the controller rejects all other anonymous upload types.
                        .requestMatchers(HttpMethod.GET, "/oss/presigned-upload-url")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET, "/oss/presigned-download-url",
                                "/oss/conversations/presigned-download-url",
                                "/oss/conversations/presigned-upload-url")
                        .authenticated()
                        .requestMatchers(HttpMethod.DELETE, "/oss/delete").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/oss/list-pictures").authenticated()
                        .requestMatchers("/oss/**").authenticated()
                        .requestMatchers("/ws/**", "/auth/**")
                        .permitAll()
                        // Push-token registration happens at signup, before the user has a JWT;
                        // the token is stored inactive. Everything else under push-notifications
                        // requires auth + ownership (checked in the controller).
                        .requestMatchers(HttpMethod.POST, "/api/push-notifications/register")
                        .permitAll()
                        // App update checks must work before login so unsupported builds can be blocked.
                        .requestMatchers(HttpMethod.GET, "/api/app-releases/**")
                        .permitAll()
                        // Liveness/readiness probe for deploys + CI image smoke test.
                        .requestMatchers("/actuator/health", "/actuator/health/**")
                        .permitAll()
                        // Spring Security 6 filters the ERROR dispatch as well as REQUEST, so
                        // without this every 404/400/500 is forwarded to /error, denied, and
                        // returned as 403 — a missing endpoint is then indistinguishable from a
                        // rejected token. Permitting the forward restores the real status codes.
                        // Genuine authorization failures are still 403: they are rejected on the
                        // REQUEST dispatch before ever reaching here, and Boot's default error
                        // body carries only timestamp/status/path (message and stacktrace are
                        // off by default), so nothing extra is exposed.
                        .requestMatchers("/error").permitAll()
                        .anyRequest().authenticated())
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS));

        http.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration authenticationConfiguration)
            throws Exception {
        return authenticationConfiguration.getAuthenticationManager();
    }
}
