# Stage 1: Build React (Vite) Dashboard
FROM node:22-alpine AS dashboard-builder
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# Stage 2: Python AgenVe2 Runtime
FROM python:3.12-slim
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY pyproject.toml README.md policy.example.yaml ./
COPY src/ ./src/
COPY --from=dashboard-builder /app/src/agenve2/dashboard_dist ./src/agenve2/dashboard_dist

RUN uv pip install --system --no-cache .

EXPOSE 8080
ENV AGENVE2_POLICY=/app/policy.example.yaml
ENV AGENVE2_DB_PATH=/data/audit.db

CMD ["agenve2", "start", "--host", "0.0.0.0", "--port", "8080"]
