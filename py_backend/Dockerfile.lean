# ClaraVerse Lean Backend Dockerfile
# Target size: ~200MB (vs 3GB+ full version)

FROM python:3.11-slim

LABEL org.opencontainers.image.title="Clara Backend (Lean)"
LABEL org.opencontainers.image.description="Lightweight Clara AI Assistant Backend"
LABEL org.opencontainers.image.version="1.0.0-lean"

WORKDIR /app

# Install only essential system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Copy lean requirements
COPY requirements-lean.txt .

# Install Python dependencies (much smaller set)
RUN pip install --no-cache-dir -r requirements-lean.txt && \
    rm -rf /root/.cache/pip/*

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 clara && \
    chown -R clara:clara /app
USER clara

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
