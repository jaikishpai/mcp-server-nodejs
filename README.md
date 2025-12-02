# MCP Oracle Server (HTTP Transport)

A production-grade Node.js Model Context Protocol (MCP) server for Oracle Database with **HTTP transport** for Telnyx AI Agent compatibility. This server exposes MCP tools over HTTP/JSON-RPC, enabling integration with Telnyx and other HTTP-based MCP clients.

## Features

- ✅ **HTTP-based MCP Protocol**: Full HTTP/JSON-RPC implementation (not STDIO)
- ✅ **Telnyx Compatible**: Designed for Telnyx AI Agent MCP integration
- ✅ **Oracle Database Integration**: Connection pooling with `oracledb` driver
- ✅ **API Key Authentication**: Secure `/mcp` endpoint with API key validation
- ✅ **MCP Tools**:
  - `runQuery`: Execute SQL queries with bind parameters
  - `listTables`: List all tables in the database
  - `getSchema`: Get detailed table schema information
  - `nl2sql`: Convert natural language to SQL using external service
- ✅ **Web Server**: Express server with `/health`, `/ready`, `/metrics`, `/webhook/telnyx`
- ✅ **Production Ready**: Logging, error handling, connection pooling, graceful shutdown
- ✅ **Dockerized**: Fully containerized with Docker Compose

## Project Structure

```
mcp-oracle/
├── src/
│   ├── server.js          # Main entrypoint: HTTP server + MCP setup
│   ├── oracle.js          # Oracle connection pool management
│   ├── auth.js            # API key authentication middleware
│   ├── web.js             # Express app and routes
│   ├── mcpTransport.js    # HTTP transport wrapper for MCP
│   ├── logger.js          # Winston logger with file rotation
│   └── tools/
│       ├── runQuery.js     # Execute SQL queries
│       ├── listTables.js   # List database tables
│       ├── getSchema.js    # Get table schema
│       └── nl2sql.js       # Natural language to SQL
├── tests/
│   ├── integration.test.sh # Integration test script
│   └── lint-setup.md       # Linting setup guide
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## Prerequisites

- Node.js 20+ (for local development)
- Docker and Docker Compose (for containerized deployment)
- Oracle Database (accessible via network)
- Oracle Instant Client (handled automatically in Docker)

## Quick Start

### 1. Setup Environment

```bash
# Copy environment file
cp .env.example .env

# Edit .env with your Oracle credentials
nano .env
```

Required environment variables:
- `ORACLE_USER`: Oracle database username
- `ORACLE_PASS`: Oracle database password
- `ORACLE_CONN`: Connection string (format: `host:port/service`)
- `MCP_API_KEY`: API key for `/mcp` endpoint authentication (recommended)

### 2. Run with Docker Compose

```bash
# Build and start all services
docker-compose up --build

# Run in detached mode
docker-compose up -d

# View logs
docker-compose logs -f mcp-oracle
```

### 3. Run Locally (Development)

```bash
# Install dependencies
npm install

# Set environment variables (or use .env file)
export ORACLE_USER=your_user
export ORACLE_PASS=your_password
export ORACLE_CONN=host:1521/XEPDB1
export MCP_API_KEY=your_api_key

# Start the server
npm start
```

## Configuration

### Environment Variables

See `.env.example` for all available configuration options:

**Required:**
- `ORACLE_USER`: Oracle database username
- `ORACLE_PASS`: Oracle database password
- `ORACLE_CONN`: Oracle connection string (format: `host:port/service`)

**Recommended:**
- `MCP_API_KEY`: API key for `/mcp` endpoint (if not set, allows unauthenticated requests in dev mode)

**Optional:**
- `PORT`: HTTP server port (default: `3000`)
- `NL2SQL_URL`: URL of NL2SQL service (default: `http://nl2sql-service:8500/query`)
- `LOG_LEVEL`: Logging level (default: `info`)
- `CORS_ORIGIN`: CORS origin (default: `*`)
- `MAX_REQUEST_SIZE`: Maximum request size (default: `10mb`)

### Oracle Connection Pool

Configure pool settings via environment variables:
- `ORACLE_POOL_MIN`: Minimum pool size (default: `2`)
- `ORACLE_POOL_MAX`: Maximum pool size (default: `10`)
- `ORACLE_POOL_INCREMENT`: Pool increment (default: `1`)
- `ORACLE_POOL_TIMEOUT`: Pool timeout in seconds (default: `60`)

## API Endpoints

### MCP Endpoint

**POST `/mcp`**

Main MCP protocol endpoint. Accepts JSON-RPC 2.0 requests.

**Authentication:**
- Header: `x-mcp-api-key: <your-api-key>`
- Or: `Authorization: Bearer <your-api-key>`

**Request Format:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

**Response Format:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [...]
  }
}
```

### Health & Monitoring

- **GET `/health`**: Basic health check
- **GET `/ready`**: Readiness check (verifies DB pool)
- **GET `/metrics`**: Prometheus-formatted metrics
- **POST `/webhook/telnyx`**: Telnyx webhook handler

## MCP Tools

### 1. runQuery

Execute a SQL query against the Oracle database.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "runQuery",
    "arguments": {
      "sql": "SELECT * FROM employees WHERE department_id = :dept_id",
      "binds": { "dept_id": 10 },
      "maxRows": 100
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"success\":true,\"data\":{\"rows\":[...],\"rowCount\":5}}"
    }]
  }
}
```

### 2. listTables

List all tables in the database.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "listTables",
    "arguments": {
      "schema": "HR"
    }
  }
}
```

### 3. getSchema

Get detailed schema information for a table.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "getSchema",
    "arguments": {
      "tableName": "employees",
      "schema": "HR"
    }
  }
}
```

### 4. nl2sql

Convert natural language query to SQL.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "nl2sql",
    "arguments": {
      "query": "Show me all customers from New York"
    }
  }
}
```

## Telnyx Configuration

### Setting up Telnyx AI Agent

1. **Configure MCP URL:**
   - In Telnyx AI Agent settings, set the MCP URL to: `https://<your-host>:<port>/mcp`
   - Example: `https://mcp.example.com:3000/mcp`

2. **Configure API Key:**
   - In Telnyx AI Agent MCP configuration, set the API key to match your `MCP_API_KEY` environment variable
   - The agent should send requests with header: `x-mcp-api-key: <your-api-key>`

3. **Example Telnyx Configuration JSON:**
```json
{
  "mcp": {
    "url": "https://your-server.com:3000/mcp",
    "apiKey": "your-secure-api-key-here",
    "transport": "http"
  }
}
```

### Testing Telnyx Integration

```bash
# Test MCP endpoint with API key
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: your-api-key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

## Example curl Commands

### List Available Tools

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: changeme" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

### Execute a Query

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: changeme" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "runQuery",
      "arguments": {
        "sql": "SELECT table_name FROM user_tables WHERE ROWNUM <= 5"
      }
    }
  }'
```

### Health Check

```bash
curl http://localhost:3000/health
```

### Telnyx Webhook

```bash
curl -X POST http://localhost:3000/webhook/telnyx \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "message.received",
    "data": {
      "from": "+1234567890",
      "to": "+0987654321",
      "text": "Hello"
    }
  }'
```

## Running Tests

### Integration Tests

The project includes a bash integration test script:

```bash
# Make script executable
chmod +x tests/integration.test.sh

# Run tests (defaults to http://localhost:3000)
./tests/integration.test.sh

# Run with custom URL and API key
BASE_URL=http://your-server:3000 MCP_API_KEY=your-key ./tests/integration.test.sh
```

The test script validates:
- Health endpoint
- Readiness endpoint
- Metrics endpoint
- MCP authentication
- MCP tools/list
- MCP tools/call (listTables)

## Docker Services

### mcp-oracle

The main MCP server container:
- Runs HTTP server on port 3000
- Exposes MCP endpoint at `/mcp`
- Mounts logs directory
- Connects to Oracle database

### nl2sql-service

FastAPI service for natural language to SQL conversion:
- Placeholder implementation included
- Exposes API on port 8500
- **Replace with your actual NL2SQL service** by updating the `image` in `docker-compose.yml`

### oracle-db (Optional)

Local Oracle database for testing:
- Uses `gvenzl/oracle-free` image
- Exposes port 1521
- Data persisted in Docker volume
- **Commented out by default** - uncomment in `docker-compose.yml` if needed

## Logging

Logs are written to:
- **Console**: Structured JSON logs with timestamps
- **Files**: Rotating log files in `logs/` directory
  - Format: `mcp-oracle-YYYY-MM-DD.log`
  - Max size: 20MB per file
  - Retention: 14 days

## Security

### API Key Authentication

The `/mcp` endpoint requires API key authentication:
- Set `MCP_API_KEY` environment variable
- Send requests with header: `x-mcp-api-key: <key>` or `Authorization: Bearer <key>`
- If `MCP_API_KEY` is not set, requests are allowed but a warning is logged (development mode)

### TLS/HTTPS

For production, enable TLS:
1. **Option 1: Application-level TLS** (not recommended)
   - Set `TLS_CERT` and `TLS_KEY` environment variables
   - Update server code to use HTTPS

2. **Option 2: Reverse Proxy** (recommended)
   - Use nginx, traefik, or similar
   - Handle TLS termination at the proxy
   - Forward requests to the application on port 3000

### Request Limits

- Maximum request size: 10MB (configurable via `MAX_REQUEST_SIZE`)
- Request timeout: 30 seconds (configurable via `MCP_REQUEST_TIMEOUT`)
- CORS: Configurable via `CORS_ORIGIN`

## Troubleshooting

### Oracle Connection Issues

1. **Check connection string format**: `host:port/service`
2. **Verify network connectivity**: `telnet host 1521`
3. **Check Oracle Instant Client**: Ensure it's installed in Docker
4. **Review logs**: Check `logs/` directory for detailed error messages

### MCP Endpoint Issues

1. **Authentication errors**: Verify `MCP_API_KEY` matches in request header
2. **Timeout errors**: Increase `MCP_REQUEST_TIMEOUT` if queries are slow
3. **Connection refused**: Ensure service is running and port is exposed

### NL2SQL Service Issues

1. **Verify service is running**: `curl http://nl2sql-service:8500/health`
2. **Check network**: Ensure services are on the same Docker network
3. **Review timeout**: Default is 30 seconds

## Design Notes / Choices

This section documents key design decisions and tradeoffs made during implementation:

### 1. HTTP Transport Implementation

**Decision**: Implemented custom HTTP transport wrapper instead of using SDK's STDIO transport.

**Rationale**: 
- The MCP SDK (`@modelcontextprotocol/sdk`) primarily supports STDIO transport
- Telnyx and other HTTP-based clients require HTTP/JSON-RPC endpoints
- Created a wrapper that routes JSON-RPC requests to MCP Server's internal request handlers
- This allows the server to work with HTTP clients while maintaining compatibility with MCP protocol

**Tradeoff**: 
- Requires manual routing of requests to handlers
- May need updates if SDK adds native HTTP transport in the future
- Benefits: Works with Telnyx and any HTTP client

### 2. API Key Authentication Pattern

**Decision**: Simple API key authentication via header, with development mode fallback.

**Rationale**:
- Telnyx requires API key-based authentication
- Supports both `x-mcp-api-key` header and `Authorization: Bearer` for flexibility
- If `MCP_API_KEY` is not set, allows requests but logs warning (useful for local development)
- Simple to implement and understand

**Tradeoff**:
- Not as secure as JWT with expiration, but sufficient for API-to-API communication
- Can be enhanced with JWT support in the future (stub provided in `auth.js`)

### 3. Request Timeout Handling

**Decision**: 30-second default timeout with configurable value.

**Rationale**:
- Prevents hanging requests from consuming resources
- SQL queries can be slow, but 30 seconds is reasonable for most cases
- Configurable via `MCP_REQUEST_TIMEOUT` for different use cases
- Returns proper JSON-RPC error response on timeout

**Tradeoff**:
- May timeout on very large/complex queries
- Users can increase timeout or optimize queries

### 4. Streaming Support

**Decision**: Implemented request-response pattern without streaming.

**Rationale**:
- MCP SDK's streaming is designed for STDIO
- HTTP request-response is simpler and more compatible
- Large result sets can be paginated using `maxRows` parameter
- Can be enhanced with Server-Sent Events (SSE) or WebSockets if needed

**Tradeoff**:
- Large result sets must be paginated
- No real-time streaming of results
- Benefits: Simpler implementation, better compatibility

### 5. Error Handling and Response Format

**Decision**: All errors return JSON-RPC 2.0 compliant responses with proper error codes.

**Rationale**:
- Maintains JSON-RPC 2.0 protocol compliance
- Provides structured error information
- Tool errors are wrapped in MCP content format
- Database errors are caught and returned as JSON

**Tradeoff**:
- Error information is nested (JSON-RPC error → MCP content → tool error)
- Benefits: Protocol compliance, structured errors, easier debugging

## License

MIT

## Contributing

Contributions welcome! Please ensure:
- Code follows existing style
- All tools return consistent JSON responses
- Error handling is comprehensive
- Logging is appropriate
- Tests are updated

## Support

For issues and questions:
1. Check logs in `logs/` directory
2. Review Docker Compose logs: `docker-compose logs`
3. Verify environment variables
4. Test Oracle connectivity independently
5. Run integration tests: `./tests/integration.test.sh`
