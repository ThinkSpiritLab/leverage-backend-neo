# Stage 1: Build
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN npm install -g pnpm@10.30.3
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Stage 2: Production
FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN npm install -g pnpm@10.30.3
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
# Uploaded problem data/media live on named volumes, not in ephemeral layers.
RUN mkdir -p /tmp/testcases /tmp/uploads && chown node:node /tmp/testcases /tmp/uploads
USER node
EXPOSE 3000
# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(async r => { const body = await r.json(); process.exit(r.ok && body.status === 'ok' ? 0 : 1); }).catch(() => process.exit(1))"
CMD ["node", "dist/src/main.js"]
