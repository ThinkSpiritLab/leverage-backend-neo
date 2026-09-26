# Build with an empty context: docker build -f deploy/judge-runtime.Dockerfile -t leverage-judge-runtime:local /tmp/empty-context
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 g++ nlohmann-json3-dev \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global --no-audit --no-fund typescript@5.9.3 @types/node@22.18.6
# The worker supplies a fixed command; no repository contents or credentials are copied.
