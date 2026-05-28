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

COPY --from=builder /app/target/*.jar app.jar

EXPOSE 8080
CMD ["java", "-jar", "app.jar"]



