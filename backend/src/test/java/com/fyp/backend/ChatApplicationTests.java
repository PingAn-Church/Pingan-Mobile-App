package com.fyp.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
		"IP_ADDR=127.0.0.1",
		"spring.datasource.url=jdbc:h2:mem:context-load;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
		"spring.datasource.driver-class-name=org.h2.Driver",
		"spring.datasource.username=sa",
		"spring.datasource.password=",
		"spring.jpa.hibernate.ddl-auto=create-drop"
})
class ChatApplicationTests {

	@Test
	void contextLoads() {
	}

}
