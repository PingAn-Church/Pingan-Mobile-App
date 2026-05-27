package com.fyp.backend.tools;

import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.tool", havingValue = "seed-admin")
public class AdminSeedTool implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminSeedTool.class);

    private final ConfigurableApplicationContext context;
    private final Environment environment;
    private final PasswordEncoder passwordEncoder;
    private final UserRepository userRepository;

    public AdminSeedTool(
            ConfigurableApplicationContext context,
            Environment environment,
            PasswordEncoder passwordEncoder,
            UserRepository userRepository) {
        this.context = context;
        this.environment = environment;
        this.passwordEncoder = passwordEncoder;
        this.userRepository = userRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            seedAdminUser();
            exit(0);
        } catch (Exception exception) {
            log.error("Admin seed failed", exception);
            exit(1);
        }
    }

    private void seedAdminUser() {
        String email = setting("app.seed.admin.email", "APP_SEED_ADMIN_EMAIL", "admin@gmail.com");
        String password = setting("app.seed.admin.password", "APP_SEED_ADMIN_PASSWORD", "12345678");
        String firstName = setting("app.seed.admin.first-name", "APP_SEED_ADMIN_FIRST_NAME", "John");
        String lastName = setting("app.seed.admin.last-name", "APP_SEED_ADMIN_LAST_NAME", "Cena");
        boolean resetPassword = Boolean.parseBoolean(
                setting("app.seed.admin.reset-password", "APP_SEED_ADMIN_RESET_PASSWORD", "false"));

        Optional<User> existingUser = userRepository.findByEmail(email);
        if (existingUser.isEmpty()) {
            User user = new User();
            user.setEmail(email);
            user.setPassword(passwordEncoder.encode(password));
            user.setFirstName(firstName);
            user.setLastName(lastName);
            user.setVerifiedUser(true);
            user.setAdmin(true);
            userRepository.save(user);
            log.info("Seeded admin user: {}", email);
            return;
        }

        User user = existingUser.get();
        boolean changed = false;

        if (!user.isAdmin()) {
            user.setAdmin(true);
            changed = true;
        }
        if (!user.isVerifiedUser()) {
            user.setVerifiedUser(true);
            changed = true;
        }
        if (isBlank(user.getFirstName())) {
            user.setFirstName(firstName);
            changed = true;
        }
        if (isBlank(user.getLastName())) {
            user.setLastName(lastName);
            changed = true;
        }
        if (resetPassword) {
            user.setPassword(passwordEncoder.encode(password));
            changed = true;
        }

        if (changed) {
            userRepository.save(user);
            log.info("Updated existing admin user: {}", email);
        } else {
            log.info("Admin user already exists, no changes needed: {}", email);
        }
    }

    private String setting(String propertyName, String environmentName, String defaultValue) {
        String value = environment.getProperty(propertyName);
        if (!isBlank(value)) {
            return value;
        }

        value = System.getenv(environmentName);
        if (!isBlank(value)) {
            return value;
        }

        return defaultValue;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private void exit(int code) {
        int exitCode = SpringApplication.exit(context, () -> code);
        System.exit(exitCode);
    }
}