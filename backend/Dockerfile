# syntax=docker/dockerfile:1
# --- Stage 1: Build the application ---
FROM maven:3.9.5-eclipse-temurin-21 AS builder
WORKDIR /app

COPY pom.xml .
COPY .mvn /app/.mvn
# Use the configured mirror (.mvn/settings.xml — Maven does NOT auto-read it, so pass
# it with -s) and a persistent ~/.m2 BuildKit cache so dependency downloads are fast
# and survive pom.xml changes / rebuilds instead of re-fetching from Maven Central.
RUN --mount=type=cache,target=/root/.m2 \
    mvn -s /app/.mvn/settings.xml dependency:go-offline -B

COPY src /app/src
RUN --mount=type=cache,target=/root/.m2 \
    mvn -s /app/.mvn/settings.xml package -DskipTests

# --- Stage 1: Runtime image ---
FROM eclipse-temurin:21-jdk
WORKDIR /app

COPY --from=builder /app/target/*.jar app.jar

EXPOSE 8080
CMD ["java", "-jar", "app.jar"]



