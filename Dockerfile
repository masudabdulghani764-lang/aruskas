# Production Dockerfile for 24/7 Cloud Hosting (Railway / Fly.io / Render / VPS)
FROM oven/bun:1.2.5 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build production Next.js bundle
COPY . .
ENV NODE_ENV=production
RUN bun run build

# Persist SQLite database & receipt uploads in /app/data
RUN mkdir -p /app/data/uploads
ENV DATABASE_PATH=/app/data/aruskas.db
ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "start"]
