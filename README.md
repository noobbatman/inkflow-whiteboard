# Inkflow Whiteboard

A real-time collaborative whiteboard application with a Java Spring Boot
backend, JavaScript frontend, Docker Compose setup, and Kubernetes
deployment configuration.

## About this project

**Sole developer** — I built the full-stack application including
backend API, frontend canvas interface, containerisation, and
cloud deployment configuration.

**What I implemented:**
- Java Spring Boot backend with REST API and WebSocket support
  for real-time collaborative drawing sessions
- JavaScript frontend with an HTML5 Canvas drawing interface —
  freehand drawing, shapes, colours, and undo/redo
- Real-time sync across multiple connected clients via WebSocket
- Docker multi-container setup: `docker-compose.yml` for the full
  stack, `docker-compose.db.yml` for database-only local development
- Kubernetes deployment manifest (`k8s-deployment.yaml`) for
  production-grade orchestration
- Railway deployment config (`railway.json`) for one-click cloud deploy

**What I learnt:**
- WebSocket communication in Spring Boot (STOMP over SockJS)
- HTML5 Canvas API — drawing primitives, event handling, coordinate
  transformation for responsive canvases
- Docker Compose for multi-service local development (app + db)
- Writing Kubernetes Deployment and Service manifests — pods,
  replicas, container specs, and service exposure
- Deploying a containerised Java app to Railway

## Tech stack
Java · Spring Boot · JavaScript · HTML5 Canvas · WebSocket (STOMP) ·
Docker · Docker Compose · Kubernetes · Railway

## Run locally

### With Docker (recommended)
```bash
git clone https://github.com/noobbatman/inkflow-whiteboard
cd inkflow-whiteboard
docker compose up --build
```
Open http://localhost:8080

### Bare-metal
```bash
# Start backend
cd whiteboard-app
./mvnw spring-boot:run

# Start frontend (in a separate terminal)
cd whiteboard-frontend
npm install && npm start
```

## Deploy to Kubernetes
```bash
kubectl apply -f k8s-deployment.yaml
```

## Project structure
```
├── whiteboard-app/       # Java Spring Boot backend
├── whiteboard-frontend/  # JavaScript + HTML5 Canvas frontend
├── docker-compose.yml    # Full stack local dev
├── k8s-deployment.yaml   # Kubernetes deployment
└── railway.json          # Railway cloud deployment
```
