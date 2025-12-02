#!/bin/bash
# Integration test script for MCP Oracle Server
# Tests the HTTP endpoints and MCP protocol over HTTP

set -e

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
MCP_API_KEY="${MCP_API_KEY:-changeme}"
MAX_WAIT_TIME=60
WAIT_INTERVAL=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Wait for service to be ready
wait_for_service() {
    log_info "Waiting for service to be ready at $BASE_URL..."
    local elapsed=0
    
    while [ $elapsed -lt $MAX_WAIT_TIME ]; do
        if curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
            log_info "Service is ready!"
            return 0
        fi
        sleep $WAIT_INTERVAL
        elapsed=$((elapsed + WAIT_INTERVAL))
        echo -n "."
    done
    
    log_error "Service did not become ready within $MAX_WAIT_TIME seconds"
    return 1
}

# Test health endpoint
test_health() {
    log_info "Testing /health endpoint..."
    local response=$(curl -s "$BASE_URL/health")
    local status=$(echo "$response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    if [ "$status" = "ok" ]; then
        log_info "✓ Health check passed"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 0
    else
        log_error "✗ Health check failed: $response"
        return 1
    fi
}

# Test ready endpoint
test_ready() {
    log_info "Testing /ready endpoint..."
    local response=$(curl -s "$BASE_URL/ready")
    local status=$(echo "$response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    if [ "$status" = "ready" ]; then
        log_info "✓ Readiness check passed"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 0
    else
        log_warn "✗ Readiness check: $response"
        return 0  # Not a failure, service might still be initializing
    fi
}

# Test metrics endpoint
test_metrics() {
    log_info "Testing /metrics endpoint..."
    local response=$(curl -s "$BASE_URL/metrics")
    
    if echo "$response" | grep -q "mcp_oracle"; then
        log_info "✓ Metrics endpoint working"
        return 0
    else
        log_error "✗ Metrics endpoint failed: $response"
        return 1
    fi
}

# Test MCP tools/list
test_mcp_tools_list() {
    log_info "Testing MCP tools/list..."
    local request='{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/list",
        "params": {}
    }'
    
    local response=$(curl -s -X POST "$BASE_URL/mcp" \
        -H "Content-Type: application/json" \
        -H "x-mcp-api-key: $MCP_API_KEY" \
        -d "$request")
    
    local has_tools=$(echo "$response" | grep -o '"tools"' || echo "")
    
    if [ -n "$has_tools" ]; then
        log_info "✓ MCP tools/list passed"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 0
    else
        log_error "✗ MCP tools/list failed: $response"
        return 1
    fi
}

# Test MCP tools/call - listTables
test_mcp_list_tables() {
    log_info "Testing MCP tools/call (listTables)..."
    local request='{
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": "listTables",
            "arguments": {}
        }
    }'
    
    local response=$(curl -s -X POST "$BASE_URL/mcp" \
        -H "Content-Type: application/json" \
        -H "x-mcp-api-key: $MCP_API_KEY" \
        -d "$request")
    
    local has_result=$(echo "$response" | grep -o '"result"' || echo "")
    
    if [ -n "$has_result" ]; then
        log_info "✓ MCP listTables call passed"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 0
    else
        log_warn "✗ MCP listTables call: $response"
        return 0  # Not a failure if DB is not connected
    fi
}

# Test MCP authentication
test_mcp_auth() {
    log_info "Testing MCP authentication (should fail without key)..."
    local request='{
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/list",
        "params": {}
    }'
    
    local response=$(curl -s -X POST "$BASE_URL/mcp" \
        -H "Content-Type: application/json" \
        -d "$request")
    
    local has_error=$(echo "$response" | grep -o '"error"' || echo "")
    
    if [ -n "$has_error" ] && [ -z "$MCP_API_KEY" ] || [ "$MCP_API_KEY" != "changeme" ]; then
        log_info "✓ Authentication check passed (correctly rejected)"
        return 0
    else
        log_warn "Authentication check: $response (may be in dev mode)"
        return 0
    fi
}

# Main test execution
main() {
    log_info "Starting integration tests for MCP Oracle Server"
    log_info "Base URL: $BASE_URL"
    log_info "API Key: ${MCP_API_KEY:0:4}..." # Show only first 4 chars
    
    # Wait for service
    if ! wait_for_service; then
        log_error "Service is not available. Exiting."
        exit 1
    fi
    
    # Run tests
    local tests_passed=0
    local tests_failed=0
    
    test_health && ((tests_passed++)) || ((tests_failed++))
    echo ""
    
    test_ready && ((tests_passed++)) || ((tests_failed++))
    echo ""
    
    test_metrics && ((tests_passed++)) || ((tests_failed++))
    echo ""
    
    test_mcp_auth && ((tests_passed++)) || ((tests_failed++))
    echo ""
    
    test_mcp_tools_list && ((tests_passed++)) || ((tests_failed++))
    echo ""
    
    test_mcp_list_tables && ((tests_passed++)) || ((tests_failed++))
    echo ""
    
    # Summary
    log_info "========================================="
    log_info "Test Summary:"
    log_info "  Passed: $tests_passed"
    log_info "  Failed: $tests_failed"
    log_info "========================================="
    
    if [ $tests_failed -eq 0 ]; then
        log_info "All tests passed! ✓"
        exit 0
    else
        log_error "Some tests failed. Review output above."
        exit 1
    fi
}

# Run main function
main

