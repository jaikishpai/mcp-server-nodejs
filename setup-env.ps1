# PowerShell script to create .env file
# Run this script: .\setup-env.ps1

if (-not (Test-Path .env)) {
    Write-Host "Creating .env file from template..." -ForegroundColor Green
    
    @"
# Oracle Database Configuration
ORACLE_USER=admin
ORACLE_PASS=password
ORACLE_CONN=host:1521/XEPDB1

# NL2SQL Service Configuration
NL2SQL_URL=http://nl2sql-service:8500/query

# Web Server Configuration
PORT=3000
ENABLE_WEB_SERVER=true

# Oracle Connection Pool Configuration
ORACLE_POOL_MIN=2
ORACLE_POOL_MAX=10
ORACLE_POOL_INCREMENT=1
ORACLE_POOL_TIMEOUT=60
ORACLE_QUEUE_TIMEOUT=60000

# Logging Configuration
LOG_LEVEL=info

# MCP API Key Configuration (for /mcp endpoint authentication)
# If not set, allows unauthenticated requests in development mode
MCP_API_KEY=123

# Oracle Database Password (for docker-compose oracle-db service)
ORACLE_DB_PASSWORD=oracle
"@ | Out-File -FilePath .env -Encoding utf8
    
    Write-Host ".env file created! Please edit it with your actual values." -ForegroundColor Yellow
} else {
    Write-Host ".env file already exists. Skipping creation." -ForegroundColor Yellow
}

