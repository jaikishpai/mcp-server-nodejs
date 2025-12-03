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
# REQUIRED for database operations (runQuery, listTables, getSchema)
# Replace ORACLE_CLIENT_DOWNLOAD_URL in docker-compose.yml build.args with your direct download link
ARG ORACLE_CLIENT_DOWNLOAD_URL
RUN mkdir -p /usr/lib/oracle && \
    cd /usr/lib/oracle && \
    echo "Downloading Oracle Instant Client from: ${ORACLE_CLIENT_DOWNLOAD_URL}" && \
    wget --no-check-certificate --no-cookies --header "Cookie: oraclelicense=accept-securebackup-cookie" \
        ${ORACLE_CLIENT_DOWNLOAD_URL} -O oracle-client.zip || \
    (echo "ERROR: Failed to download Oracle Instant Client" && \
     echo "URL: ${ORACLE_CLIENT_DOWNLOAD_URL}" && \
     echo "Please verify the URL is correct and accessible" && \
     exit 1) && \
    echo "Download complete, extracting..." && \
    unzip -q oracle-client.zip || \
    (echo "ERROR: Failed to extract Oracle Instant Client zip file" && \
     exit 1) && \
    rm oracle-client.zip && \
    INSTALL_DIR=$(ls -d instantclient_* | head -1) && \
    if [ -z "${INSTALL_DIR}" ]; then \
        echo "ERROR: Could not find instantclient directory after extraction"; \
        echo "Contents of /usr/lib/oracle:"; \
        ls -la; \
        exit 1; \
    fi && \
    echo "Found installation directory: ${INSTALL_DIR}" && \
    cd ${INSTALL_DIR} && \
    LIB_VERSION=$(ls libclntsh.so.* 2>/dev/null | head -1 | sed 's/libclntsh.so.//') && \
    if [ -z "${LIB_VERSION}" ]; then \
        echo "ERROR: Could not find libclntsh.so library"; \
        echo "Contents of ${INSTALL_DIR}:"; \
        ls -la; \
        exit 1; \
    fi && \
    ln -sf libclntsh.so.${LIB_VERSION} libclntsh.so && \
    ln -sf libocci.so.${LIB_VERSION} libocci.so && \
    echo "Oracle Client installed successfully" && \
    INSTALL_FULL_PATH="/usr/lib/oracle/${INSTALL_DIR}" && \
    echo "Install directory: ${INSTALL_FULL_PATH}" && \
    echo "Library version: ${LIB_VERSION}" && \
    echo "${INSTALL_FULL_PATH}" > /etc/oracle_client_path.txt

# Set Oracle environment variables based on detected installation
# Read the detected path and set environment variables
RUN if [ -f /etc/oracle_client_path.txt ]; then \
        INSTALL_DIR=$(cat /etc/oracle_client_path.txt) && \
        echo "Detected Oracle Client path: ${INSTALL_DIR}" && \
        echo "${INSTALL_DIR}" > /tmp/oracle_path.env; \
    fi

# Set Oracle environment variables
# Use detected path if available, otherwise use default
ENV ORACLE_CLIENT_PATH=/usr/lib/oracle/instantclient_23_26
ENV LD_LIBRARY_PATH=/usr/lib/oracle/instantclient_23_26
ENV ORACLE_HOME=/usr/lib/oracle/instantclient_23_26
ENV TNS_ADMIN=/usr/lib/oracle/instantclient_23_26/network/admin

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
