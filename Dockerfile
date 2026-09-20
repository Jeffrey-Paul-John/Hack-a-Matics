# Multi-stage/lightweight Python 3.12 slim container for MedFlow Backend
FROM python:3.12-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src

WORKDIR /app

# Install system utilities (curl for container health checks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy runtime configuration and application code
COPY config/ ./config/
COPY src/ ./src/

# Expose default port
EXPOSE 8000

# Health check using the fast /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# ARCHITECTURAL NOTE:
# MedFlow's simulation engine and tenant session states reside in memory.
# Running multiple uvicorn workers would split user state and WebSocket events.
# Always run a SINGLE worker (--workers 1) per instance. Horizontal scaling
# across multiple replicas requires external Redis or PostgreSQL session stores.
CMD ["sh", "-c", "uvicorn medflow.api.main:app --app-dir src --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
