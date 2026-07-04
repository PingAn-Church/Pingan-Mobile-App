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
                        // Public read-only content (homepage works post-login)
                        .requestMatchers(HttpMethod.GET, "/api/events/**", "/api/videos/**", "/api/announcements/**")
                        .permitAll()
                        // OSS management must be authenticated: listing every stored object
                        // and deleting by name are abuse vectors and only ever run post-login.
                        .requestMatchers(HttpMethod.DELETE, "/oss/delete").authenticated()
                        .requestMatchers(HttpMethod.GET, "/oss/list-pictures").authenticated()
                        // Remaining /oss + /s3 stay open because registration uploads an avatar pre-auth
                        .requestMatchers("/ws/**", "/auth/**", "/s3/**", "/oss/**")
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
