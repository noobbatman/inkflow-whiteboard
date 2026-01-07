# Build stage
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY whiteboard-app ./whiteboard-app
WORKDIR /app/whiteboard-app
RUN mvn clean package -DskipTests
RUN ls -la target/ && echo "Build completed successfully"

# Runtime stage
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/whiteboard-app/target/whiteboard-app-*.jar ./app.jar
RUN ls -la /app/app.jar

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create entrypoint script as root before switching user
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -- ${@}' >> /app/entrypoint.sh && \
    echo 'exec java -Xmx512m -Xms256m -Dserver.port=${PORT:-8081} -jar /app/app.jar --spring.profiles.active=prod' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh && \
    chown appuser:appgroup /app/entrypoint.sh

USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8081}/actuator/health || exit 1

EXPOSE ${PORT:-8081}
ENTRYPOINT ["/app/entrypoint.sh"]
