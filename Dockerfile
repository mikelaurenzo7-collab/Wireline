# ─────────────────────────────────────────────────────────────────
# Wireline — Production Docker Image
# Multi-stage build: deps → build → runtime
#
# Usage (single-tenant self-hosted):
#   docker build -t wireline .
#   docker run --env-file .env -p 3000:3000 wireline
# ─────────────────────────────────────────────────────────────────

# ── Stage 1: dependency resolution ───────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Only copy the package manifests first so Docker layer-caches the
# npm install step and only reruns it when deps actually change.
COPY package.json package-lock.json ./

# ci = deterministic, skip optional peer dep warnings
RUN npm ci --no-audit --no-fund

# ── Stage 2: builder ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Reinstall deps fresh (no devDeps optimization here — we need esbuild
# and other devDeps at build time, so we keep the full install).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Build: Vite frontend + esbuild server bundle.
# NODE_OPTIONS bumped so tsc + vite don't OOM in constrained builders.
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

# ── Stage 3: production runtime ──────────────────────────────────
FROM node:22-alpine AS runtime

LABEL org.opencontainers.image.source="https://github.com/mikelaurenzo7-collab/Wireline"
LABEL org.opencontainers.image.description="Wireline — omnichannel agent fleet"
LABEL org.opencontainers.image.licenses="UNLICENSED"

# Security: run as a non-root user.
RUN addgroup -S wireline && adduser -S wireline -G wireline

WORKDIR /app

# Only copy what's needed to serve — the compiled artifacts + runtime
# production dependencies (node_modules for any dynamic require calls
# that the esbuild bundle externalizes).
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Static assets (site.webmanifest, robots.txt, sitemap.xml)
COPY --from=builder /app/public ./public

USER wireline

# Port that Express listens on. Override with the PORT env var at
# runtime if your infra provider assigns a different port.
EXPOSE 3000

ENV NODE_ENV=production

# Health check — the /api/health endpoint probes the DB and returns
# HTTP 200 when healthy, 503 when degraded.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server.cjs"]
