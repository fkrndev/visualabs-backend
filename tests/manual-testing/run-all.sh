#!/bin/bash

# ============================================================================
# Run All Functional Tests
# This script runs all manual functional testing scripts
# ============================================================================

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TOTAL_TESTS=0
TOTAL_PASSED=0
TOTAL_FAILED=0

# Helper function to print section header
print_section() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Helper function to print summary
print_summary() {
    echo -e "\n${YELLOW}========================================${NC}"
    echo -e "${YELLOW}OVERALL TEST SUMMARY${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo -e "Total Tests: $TOTAL_TESTS"
    echo -e "${GREEN}Total Passed: $TOTAL_PASSED${NC}"
    echo -e "${RED}Total Failed: $TOTAL_FAILED${NC}"
    echo -e "${YELLOW}========================================${NC}"
    
    if [ $TOTAL_FAILED -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed.${NC}"
        exit 1
    fi
}

# ============================================================================
# PRE-RUN CHECKS
# ============================================================================
print_section "PRE-RUN CHECKS"

echo "Checking if backend server is running..."
if curl -s -f "http://localhost:2024" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend server is running${NC}"
else
    echo -e "${RED}✗ Backend server is not running${NC}"
    echo "Please start the backend server first:"
    echo "  cd v-auto-backend && bun run dev"
    exit 1
fi

echo ""
echo "Checking test scripts..."
if [ ! -f "$SCRIPT_DIR/01-admin-auth.sh" ]; then
    echo -e "${RED}✗ 01-admin-auth.sh not found${NC}"
    exit 1
fi
if [ ! -f "$SCRIPT_DIR/02-customer-auth.sh" ]; then
    echo -e "${RED}✗ 02-customer-auth.sh not found${NC}"
    exit 1
fi
if [ ! -f "$SCRIPT_DIR/03-token-management.sh" ]; then
    echo -e "${RED}✗ 03-token-management.sh not found${NC}"
    exit 1
fi
if [ ! -f "$SCRIPT_DIR/04-edge-cases.sh" ]; then
    echo -e "${RED}✗ 04-edge-cases.sh not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ All test scripts found${NC}"

# ============================================================================
# MAKE SCRIPTS EXECUTABLE
# ============================================================================
print_section "MAKING SCRIPTS EXECUTABLE"
chmod +x "$SCRIPT_DIR/01-admin-auth.sh"
chmod +x "$SCRIPT_DIR/02-customer-auth.sh"
chmod +x "$SCRIPT_DIR/03-token-management.sh"
chmod +x "$SCRIPT_DIR/04-edge-cases.sh"
echo -e "${GREEN}✓ Scripts made executable${NC}"

# ============================================================================
# RUN TESTS
# ============================================================================

# Test 1: Admin Authentication
print_section "RUNNING: Admin Authentication Flow"
bash "$SCRIPT_DIR/01-admin-auth.sh"
RESULT=$?
if [ $RESULT -eq 0 ]; then
    TOTAL_PASSED=$((TOTAL_PASSED + 17))
else
    TOTAL_FAILED=$((TOTAL_FAILED + 17))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 17))

# Test 2: Customer Authentication
print_section "RUNNING: Customer Authentication Flow"
bash "$SCRIPT_DIR/02-customer-auth.sh"
RESULT=$?
if [ $RESULT -eq 0 ]; then
    TOTAL_PASSED=$((TOTAL_PASSED + 12))
else
    TOTAL_FAILED=$((TOTAL_FAILED + 12))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 12))

# Test 3: Token Management
print_section "RUNNING: Token Management"
bash "$SCRIPT_DIR/03-token-management.sh"
RESULT=$?
if [ $RESULT -eq 0 ]; then
    TOTAL_PASSED=$((TOTAL_PASSED + 7))
else
    TOTAL_FAILED=$((TOTAL_FAILED + 7))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 7))

# Test 4: Edge Cases
print_section "RUNNING: Edge Cases"
bash "$SCRIPT_DIR/04-edge-cases.sh"
RESULT=$?
if [ $RESULT -eq 0 ]; then
    TOTAL_PASSED=$((TOTAL_PASSED + 6))
else
    TOTAL_FAILED=$((TOTAL_FAILED + 6))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 6))

# ============================================================================
# FINAL SUMMARY
# ============================================================================
print_summary
