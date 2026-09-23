# kiteai-llm-x402 — minimal Node 22 image (mirrors the proven frankfurter-x402 Docker setup)
FROM node:22-alpine

WORKDIR /app

# Install deps first to leverage the layer cache.
# npm ci requires package-lock.json (committed). It keeps devDependencies by
# default; tsx now lives in "dependencies" so `npm start` always resolves it.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the service source.
COPY . .

# Render injects PORT at runtime; the app reads it via process.env.PORT.
# Keep a sane fallback for local `docker run -p 8080:8080`.
ENV PORT=8080
EXPOSE 8080

# Liveness probe so Render / UptimeRobot can confirm the service is up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/healthz" >/dev/null 2>&1 || exit 1

# Equivalent to `tsx src/index.ts` — runs the x402 pay-per-call LLM gateway.
CMD ["npm", "start"]
