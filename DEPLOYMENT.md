# Production Deployment Guide

## Pre-Deployment Checklist

### ✅ Required Configuration

1. **Environment Variables** (set in `.env` or deployment platform):
   ```bash
   # Required
   ORACLE_USER=your_oracle_user
   ORACLE_PASS=your_oracle_password
   ORACLE_CONN=host:port/service
   MCP_API_KEY=your-secure-api-key-here  # REQUIRED in production
   
   # Recommended
   NODE_ENV=production
   PORT=3000
   # CORS_ORIGIN=https://your-telnyx-domain.com  # TODO: For future - restrict CORS to specific domains
   LOG_LEVEL=info
   ```

2. **Security Settings**:
   - ✅ Set `MCP_API_KEY` - Required in production
   - ⏳ Set `CORS_ORIGIN` - TODO: For future - restrict to Telnyx domain(s) (currently allows all origins)
   - ✅ Set `NODE_ENV=production` - Enables production security
   - ✅ Use HTTPS/TLS (via reverse proxy recommended)

3. **Oracle Database**:
   - ✅ Ensure Oracle database is accessible from deployment environment
   - ✅ Verify connection string format: `host:port/service`
   - ✅ Test connection before deployment

### 🔒 Security Considerations

1. **TLS/HTTPS** (Required for production):
   - Use a reverse proxy (nginx, traefik, AWS ALB, etc.)
   - Configure TLS termination at the proxy
   - Forward HTTP requests to app on port 3000

2. **API Key**:
   - Generate a strong, random API key (32+ characters)
   - Store securely (environment variables, secrets manager)
   - Never commit to version control

3. **CORS** (TODO: For future implementation):
   - Currently allows all origins (`*`) for easier deployment
   - Future: Set `CORS_ORIGIN` to specific Telnyx domain(s) for better security
   - Code is prepared for restriction but commented for now

4. **Network Security**:
   - Use firewall rules to restrict access
   - Consider VPN or private network for Oracle DB
   - Use database connection encryption if available

## Deployment Options

### Option 1: Docker (Recommended)

```bash
# Build and deploy
docker-compose up -d --build

# Or use Docker directly
docker build -t mcp-oracle-server .
docker run -d \
  -p 3000:3000 \
  -e ORACLE_USER=user \
  -e ORACLE_PASS=pass \
  -e ORACLE_CONN=host:1521/service \
  -e MCP_API_KEY=your-key \
  -e NODE_ENV=production \
  -e CORS_ORIGIN=https://your-domain.com \
  mcp-oracle-server
```

### Option 2: Cloud Platforms

#### AWS (ECS/Fargate)
- Use ECS task definition with environment variables
- Configure ALB for HTTPS termination
- Use Secrets Manager for sensitive values

#### Google Cloud (Cloud Run)
- Deploy container with environment variables
- Configure Cloud Load Balancer for HTTPS
- Use Secret Manager for API keys

#### Azure (Container Instances)
- Deploy container with environment variables
- Use Application Gateway for HTTPS
- Use Key Vault for secrets

### Option 3: Traditional Server

```bash
# Install dependencies
npm ci --production

# Set environment variables
export NODE_ENV=production
export ORACLE_USER=...
export ORACLE_PASS=...
export ORACLE_CONN=...
export MCP_API_KEY=...

# Use PM2 for process management
npm install -g pm2
pm2 start src/server.js --name mcp-oracle
pm2 save
pm2 startup
```

## Telnyx Configuration

### 1. Get Your Server URL
- Deploy server and get public URL (e.g., `https://mcp.yourdomain.com`)
- Ensure HTTPS is enabled

### 2. Configure Telnyx AI Agent

In Telnyx AI Agent settings:

```json
{
  "mcp": {
    "url": "https://mcp.yourdomain.com/mcp",
    "apiKey": "your-mcp-api-key-here",
    "transport": "http"
  }
}
```

**Headers to send:**
- `Content-Type: application/json`
- `x-mcp-api-key: your-mcp-api-key-here`

### 3. Test Connection

```bash
curl -X POST https://mcp.yourdomain.com/mcp \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: your-api-key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Monitoring & Health Checks

### Health Endpoints

- `GET /health` - Basic health check
- `GET /ready` - Readiness check (verifies DB connection)
- `GET /metrics` - Prometheus metrics

### Logging

- Logs written to `logs/` directory
- Rotating daily, 14-day retention
- Set `LOG_LEVEL=info` for production (or `warn` for less verbose)

### Monitoring Recommendations

1. **Set up alerts for**:
   - Health check failures
   - High error rates
   - Database connection failures
   - High response times

2. **Monitor**:
   - Request rate
   - Error rates
   - Database connection pool usage
   - Response times

## Troubleshooting

### Common Issues

1. **"Endpoint not found"**:
   - Verify server is running
   - Check route registration in logs
   - Verify URL includes `/mcp` path

2. **"Unauthorized"**:
   - Verify `MCP_API_KEY` matches in Telnyx config
   - Check header name: `x-mcp-api-key`
   - Verify API key is set in environment

3. **Database connection failures**:
   - Verify Oracle connection string format
   - Check network connectivity
   - Verify credentials
   - Check Oracle Instant Client in Docker

4. **CORS errors**:
   - Currently allows all origins - should work out of the box
   - Future: If restricting CORS, set `CORS_ORIGIN` to Telnyx domain
   - Verify HTTPS is used

## Production Best Practices

1. ✅ Use reverse proxy for TLS termination
2. ✅ Set strong API keys
3. ✅ Restrict CORS to known domains
4. ✅ Monitor logs and metrics
5. ✅ Set up automated health checks
6. ✅ Use secrets management for sensitive data
7. ✅ Enable database connection encryption
8. ✅ Set appropriate timeouts
9. ✅ Use connection pooling (already configured)
10. ✅ Implement rate limiting (consider adding)

## Next Steps

1. Deploy to your chosen platform
2. Configure Telnyx with your server URL and API key
3. Test the connection
4. Monitor logs and metrics
5. Set up alerts

## Support

For issues:
1. Check logs in `logs/` directory
2. Review health endpoint responses
3. Verify environment variables
4. Test Oracle connectivity independently

