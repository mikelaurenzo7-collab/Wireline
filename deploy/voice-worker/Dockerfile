FROM node:22-bookworm-slim AS build
ARG VOICE_WORKER_SOURCE_REVISION
RUN node -e "if (!/^[a-f0-9]{40}$/i.test(process.argv[1] || '')) process.exit(1)" "$VOICE_WORKER_SOURCE_REVISION"
WORKDIR /app
ENV HUSKY=0
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
RUN ./node_modules/.bin/esbuild src/entrypoints/voice-worker.ts --platform=node --packages=external --bundle --format=cjs --outfile=dist/voice-worker.cjs

FROM node:22-bookworm-slim
ARG VOICE_WORKER_SOURCE_REVISION
ENV WIRELINE_VOICE_WORKER_SOURCE_REVISION=$VOICE_WORKER_SOURCE_REVISION
LABEL org.opencontainers.image.revision=$VOICE_WORKER_SOURCE_REVISION
WORKDIR /app
ENV NODE_ENV=production
ENV WIRELINE_VOICE_WORKER=true
ENV PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist/voice-worker.cjs ./dist/voice-worker.cjs
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
CMD ["node", "dist/voice-worker.cjs"]
