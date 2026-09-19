FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV HUSKY=0
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
RUN ./node_modules/.bin/esbuild src/entrypoints/voice-worker.ts --platform=node --packages=external --bundle --format=cjs --outfile=dist/voice-worker.cjs

FROM node:22-bookworm-slim
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
