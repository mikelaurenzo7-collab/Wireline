# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Install deps (all — devDeps needed for vite + esbuild)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build
# Result: dist/ contains both frontend assets (vite) and dist/server.js (esbuild)

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install only production deps (no devDeps)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Tini for proper PID 1 signal handling
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "dist/server.js"]
