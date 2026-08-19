package com.fyp.backend.service;

import java.io.UnsupportedEncodingException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

@Service
public class EmailService {

    private static final String FROM_NAME = "Pingan Church SG";

    @Autowired
    private JavaMailSender mailSender;

    // The authenticated SMTP account; used as the actual From address while the
    // displayed sender name stays friendly ("Pingan Church SG <address>").
    // Defaulted to empty so the context still loads when the var is unset (CI).
    @Value("${spring.mail.username:}")
    private String fromAddress;

    public void sendPasswordResetCodeEmail(String toEmail, String code) {
        send(toEmail, "Ping An App - Password reset code",
                "Your password reset code is: " + code +
                "\nIt is valid for a few minutes. If you didn't request a password reset, "
                + "you can ignore this email - your password has not been changed.");
    }

    public void sendVerificationCodeEmail(String toEmail, String code) {
        send(toEmail, "Ping An App - Your verification code",
                "Your verification code is: " + code +
                "\nIt is valid for a few minutes. If you didn't request this, you can ignore this email.");
    }

    private void send(String toEmail, String subject, String text) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            helper.setFrom(fromAddress, FROM_NAME);
            helper.setTo(toEmail);
            helper.setSubject(subject);
            helper.setText(text);
            mailSender.send(message);
        } catch (MessagingException | UnsupportedEncodingException e) {
            throw new RuntimeException("Failed to send email to " + toEmail, e);
        }
    }
}
