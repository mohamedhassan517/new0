FROM node:20-slim

# Install system deps and mysql client
RUN apt-get update && apt-get install -y \
    default-mysql-client \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Use pnpm
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

# Install dependencies
COPY package*.json ./
RUN pnpm install --no-frozen-lockfile

# Copy source
COPY . .

# Build the project (creates dist/)
RUN pnpm build

# Copy wait script into image
COPY wait-for-mysql.sh /usr/local/bin/wait-for-mysql.sh
RUN chmod +x /usr/local/bin/wait-for-mysql.sh

EXPOSE 3000

# Wait for mysql then start the server
CMD ["/bin/sh", "-c", "/usr/local/bin/wait-for-mysql.sh && npm run start"]
