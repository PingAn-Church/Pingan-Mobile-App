package com.fyp.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
		"IP_ADDR=127.0.0.1",
		"spring.datasource.url=jdbc:h2:mem:context-load;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
		"spring.datasource.driver-class-name=org.h2.Driver",
		"spring.datasource.username=sa",
		"spring.datasource.password=",
		"spring.jpa.hibernate.ddl-auto=create-drop",
		// application.properties pins the PostgreSQL dialect, which makes Hibernate
		// emit "insert ... returning id" for IDENTITY keys — syntax H2 rejects even
		// in PostgreSQL mode. Nothing hit it until a startup task inserted a User;
		// the app-level group seeder is exempt because Conversation keys come from a
		// generator rather than IDENTITY.
		"spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"
})
class ChatApplicationTests {

	@Test
	void contextLoads() {
	}

}
