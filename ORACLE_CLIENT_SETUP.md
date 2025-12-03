# Oracle Instant Client Setup Guide

## Problem

Oracle Instant Client downloads from Oracle's website require accepting license terms, which can cause Docker builds to fail when using direct `wget` downloads.

## Solutions

### Option 1: Manual Download (Recommended for Development)

1. **Download Oracle Instant Client manually:**
   - Visit: https://www.oracle.com/database/technologies/instant-client/linux-x86-64-downloads.html
   - Accept the license agreement
   - Download: `instantclient-basic-linux.x64-21.1.0.0.0.zip`

2. **Place the file in your project root:**
   ```
   oracle-mcp/
   ├── oracle-instantclient-basic-linux.x64-21.1.0.0.0.zip
   ├── Dockerfile
   └── ...
   ```

3. **Update Dockerfile to use COPY instead of wget:**
   ```dockerfile
   # Copy Oracle Instant Client from build context
   COPY oracle-instantclient-basic-linux.x64-21.1.0.0.0.zip /tmp/
   
   RUN mkdir -p /usr/lib/oracle && \
       cd /usr/lib/oracle && \
       unzip -q /tmp/oracle-instantclient-basic-linux.x64-21.1.0.0.0.zip && \
       cd instantclient_21_1 && \
       ln -s libclntsh.so.21.1 libclntsh.so && \
       ln -s libocci.so.21.1 libocci.so && \
       rm /tmp/oracle-instantclient-basic-linux.x64-21.1.0.0.0.zip
   ```

4. **Add to .gitignore:**
   ```
   oracle-instantclient-*.zip
   ```

### Option 2: Use Oracle's Official Container Images

If Oracle provides official container images with Instant Client pre-installed, use those as a base:

```dockerfile
FROM oraclelinux:8-slim
# Install Node.js and Oracle Client
# ... (check Oracle's documentation)
```

### Option 3: Build a Custom Base Image

Create a base image with Oracle Client pre-installed:

```dockerfile
# Dockerfile.base
FROM node:20-slim
# Install Oracle Instant Client here
# Build: docker build -t node-oracle:20-slim -f Dockerfile.base .
```

Then use it:
```dockerfile
FROM node-oracle:20-slim
# Your application code
```

### Option 4: Use Oracle Instant Client RPM (if available)

Some distributions provide Oracle Instant Client via package managers:

```dockerfile
RUN apt-get update && \
    apt-get install -y alien && \
    wget https://download.oracle.com/otn_software/linux/instantclient/oracle-instantclient-basic-21.1.0.0.0-1.x86_64.rpm && \
    alien -i oracle-instantclient-basic-21.1.0.0.0-1.x86_64.rpm
```

### Option 5: Skip Oracle Client in Docker (Use External DB)

If your Oracle database is external and accessible, you might be able to:

1. Install Oracle Instant Client on the host machine
2. Mount it as a volume in Docker
3. Or use a database proxy/gateway

## Current Dockerfile Status

The current `Dockerfile` attempts to download Oracle Instant Client with license acceptance headers. If this fails:

1. **Try the manual download method (Option 1)** - Most reliable
2. **Check Oracle's download page** - URLs may have changed
3. **Use a CI/CD pipeline** - Download during build process with proper authentication

## Testing

After setting up Oracle Client:

```bash
# Build the image
docker build -t mcp-oracle-server .

# Test Oracle Client installation
docker run --rm mcp-oracle-server \
  sh -c "ls -la /usr/lib/oracle/instantclient_21_1/"

# Should show Oracle library files
```

## Production Recommendations

For production deployments:

1. **Use a pre-built base image** with Oracle Client
2. **Use a secrets manager** for Oracle credentials
3. **Use a managed Oracle database service** (AWS RDS, Azure Database, etc.)
4. **Consider using Oracle's official container images** if available

