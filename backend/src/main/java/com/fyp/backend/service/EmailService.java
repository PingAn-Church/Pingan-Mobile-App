package com.fyp.backend.service;

import org.springframework.stereotype.Service;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.beans.factory.annotation.Autowired;

@Service
public class EmailService {

    @Autowired
    private JavaMailSender mailSender;

    public void sendPasswordResetEmail(String toEmail, String newPassword) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(toEmail);
        message.setSubject("Ping An App - Password Reset Request");
        message.setText("Your new password is: " + newPassword +
                        "\nPlease change it after logging in.");
        mailSender.send(message);
    }

    public void sendVerificationCodeEmail(String toEmail, String code) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(toEmail);
        message.setSubject("Ping An App - Your verification code");
        message.setText("Your verification code is: " + code +
                        "\nIt is valid for a few minutes. If you didn't request this, you can ignore this email.");
        mailSender.send(message);
    }
}