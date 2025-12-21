# syntax=docker/dockerfile:1

FROM node:20-slim AS builder

# Install build deps for native modules like better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Use corepack to install pnpm at pinned version
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

# Copy lockfiles and package manifests first
COPY package.json pnpm-lock.yaml .npmrc ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build client and server
RUN pnpm build

# Prune dev dependencies for smaller runtime image
RUN pnpm prune --prod

# Runtime image
FROM node:20-slim AS runner

ENV NODE_ENV=production
WORKDIR /app

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Copy production node_modules (keep compiled native modules)
COPY --from=builder /app/node_modules ./node_modules

# Copy built assets
COPY --from=builder /app/dist ./dist

# Copy any required public assets (optional)
COPY --from=builder /app/public ./public

# Expose port
EXPOSE 3000

# Default environment; override via docker or compose
ENV PORT=3000
# For SQLite persistence inside container, point LOCAL_DB_DIR to /app/data
ENV LOCAL_DB_DIR=/app/data

# Run the compiled server that serves both API and SPA
CMD ["node","dist/server/node-build.cjs"]