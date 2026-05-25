package com.fyp.backend;

import org.springframework.core.env.Environment;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// https://www.youtube.com/watch?v=TywlS9iAZCM&pp=ygUcYnVpbGQgYSBjaGF0IGFwcCBzcHJpbmcgYm9vdA%3D%3D
@SpringBootApplication
@EnableScheduling
public class ChatApplication {

	@Autowired
	private Environment env;

	public static void main(String[] args) {
		SpringApplication.run(ChatApplication.class, args);
	}

}
