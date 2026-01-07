# Build stage
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY whiteboard-app ./whiteboard-app
WORKDIR /app/whiteboard-app
RUN mvn clean package -DskipTests -q

# Runtime stage
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/whiteboard-app/target/whiteboard-app-*.jar ./app.jar

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8081}/actuator/health || exit 1

EXPOSE ${PORT:-8081}
ENTRYPOINT ["sh", "-c", "java -Xmx512m -Xms256m -Dserver.port=${PORT:-8081} -jar app.jar --spring.profiles.active=prod"]
