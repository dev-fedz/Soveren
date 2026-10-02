# Build stage
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install system dependencies needed for native modules, git tools, process inspection, and Docker CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    ripgrep \
    iproute2 \
    procps \
    lsof \
    curl \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (not the daemon — we use the host's Docker via socket mount)
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first to leverage Docker layer caching
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install root and frontend dependencies
RUN npm install --frozen-lockfile || npm install
RUN npm --prefix frontend install --frozen-lockfile || npm --prefix frontend install

# Copy the rest of the application
COPY . .

# Expose backend API (5001) and frontend UI (5173)
EXPOSE 5001 5173

# Default command to run the agent CLI
CMD ["npx", "tsx", "src/cli/index.ts"]
