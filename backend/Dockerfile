# --- Stage 1: Build the application ---
FROM maven:3.9.5-eclipse-temurin-21 AS builder
WORKDIR /app

COPY pom.xml .
COPY .mvn /app/.mvn
RUN mvn dependency:go-offline -B

COPY src /app/src
RUN mvn package -DskipTests

# --- Stage 1: Runtime image ---
FROM eclipse-temurin:21-jdk
WORKDIR /app

# Pin the JVM to UTC. This formalizes what the base image already defaults to —
# clients normalize the zone-less timestamps in chat/thread payloads by assuming
# server-UTC (see frontend/src/utils/serverDate.js), so the server timezone must
# never drift with a base-image change or host setting.
ENV TZ=UTC

COPY --from=builder /app/target/*.jar app.jar

EXPOSE 8080
CMD ["java", "-jar", "app.jar"]



