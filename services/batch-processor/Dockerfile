# F1.3 — batch renewal worker.
# Minimal python:3.12-slim. Build context is this directory only.
#
# Build: docker build -t dealpad-batch-processor services/batch-processor
# Run:   docker run --rm \
#          -e REDIS_URL=redis://host.docker.internal:6379/0 \
#          -e DEALPAD_API_URL=http://host.docker.internal:3001 \
#          -e DEALPAD_API_TOKEN=<token> \
#          dealpad-batch-processor

FROM python:3.12-slim

WORKDIR /app

# Install system deps in a single layer; clean apt lists so the image stays small.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py tasks.py ./

# Healthcheck pings the celery inspect endpoint over the broker. If the
# worker can't reach Redis at all this fails immediately and the
# container is restarted.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD celery -A app inspect ping --timeout=5 || exit 1

CMD ["celery", "-A", "app", "worker", "--loglevel=info", "--concurrency=4"]
