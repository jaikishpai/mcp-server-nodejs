# Multi-stage build for MCP Oracle Server

# Stage 1: Build dependencies
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Runtime
FROM node:20-slim

WORKDIR /app

# Install runtime dependencies for Oracle Instant Client
# Oracle Instant Client requires libaio1
RUN apt-get update && apt-get install -y \
    libaio1 \
    wget \
    unzip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Oracle Instant Client
# Oracle Instant Client 21.1.0.0.0 for Linux x64
# Note: For production, consider using a base image with Oracle Client pre-installed
# or use Oracle's official container images
ENV ORACLE_CLIENT_VERSION=21.1.0.0.0
ENV ORACLE_CLIENT_PATH=/usr/lib/oracle/instantclient_21_1

RUN mkdir -p /usr/lib/oracle && \
    cd /usr/lib/oracle && \
    wget -q https://download.oracle.com/otn_software/linux/instantclient/211000/instantclient-basic-linux.x64-21.1.0.0.0.zip && \
    unzip instantclient-basic-linux.x64-21.1.0.0.0.zip && \
    rm instantclient-basic-linux.x64-21.1.0.0.0.zip && \
    cd instantclient_21_1 && \
    ln -s libclntsh.so.21.1 libclntsh.so && \
    ln -s libocci.so.21.1 libocci.so

# Set Oracle environment variables
ENV LD_LIBRARY_PATH=/usr/lib/oracle/instantclient_21_1:$LD_LIBRARY_PATH
ENV ORACLE_HOME=/usr/lib/oracle/instantclient_21_1
ENV TNS_ADMIN=/usr/lib/oracle/instantclient_21_1/network/admin
ENV ORACLE_CLIENT_PATH=/usr/lib/oracle/instantclient_21_1

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY src/ ./src/
COPY package*.json ./

# Create logs directory and set permissions
RUN mkdir -p logs && \
    chown -R node:node /app

# Switch to non-root user
USER node

# Expose port for HTTP server
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the server
CMD ["node", "src/server.js"]
