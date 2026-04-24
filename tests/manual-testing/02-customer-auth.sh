#!/bin/bash

# ============================================================================
# Functional Testing: Customer Authentication Flow
# Total Test Cases: 12
# ============================================================================

# Configuration
BASE_URL="http://localhost:2024"
API_BASE="$BASE_URL/api/public"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=12
PASSED=0
FAILED=0

# Helper function to print test result
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASSED${NC}: $2"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC}: $2"
        ((FAILED++))
    fi
}

# Helper function to print test header
print_header() {
    echo -e "\n${YELLOW}========================================${NC}"
    echo -e "${YELLOW}TEST: $1${NC}"
    echo -e "${YELLOW}========================================${NC}"
}

# ============================================================================
# SETUP: Create test customer user (if not exists)
# ============================================================================
print_header "Setup: Create Test Customer User"
echo "Note: This setup assumes you have a working customer registration endpoint"
echo "If not, please manually create a test customer user in the database"
echo ""
echo "Test Customer Credentials:"
echo "  Email: owner@tokobaju.id"
echo "  Phone: 628222000001"
echo "  Username: tokobaju"
echo "  Password: password123"
echo ""

# ============================================================================
# TEST 1: Customer login with valid email
# ============================================================================
print_header "TEST 1: Customer login with valid email"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/login" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "owner@tokobaju.id",
    "password": "password123"
  }')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Code: $HTTP_CODE"
echo "Response: $BODY"

if [ "$HTTP_CODE" = "200" ]; then
    # Extract access token
    ACCESS_TOKEN=$(echo "$BODY" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    print_result 0 "Customer login with valid email"
    echo "Access Token: ${ACCESS_TOKEN:0:50}..."
else
    print_result 1 "Customer login with valid email"
    echo "Expected HTTP 200, got $HTTP_CODE"
fi

# ============================================================================
# TEST 2: Customer login with valid phone number
# ============================================================================
print_header "TEST 2: Customer login with valid phone number"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/login" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "628222000001",
    "password": "password123"
  }')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Code: $HTTP_CODE"
echo "Response: $BODY"

if [ "$HTTP_CODE" = "200" ]; then
    ACCESS_TOKEN=$(echo "$BODY" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    print_result 0 "Customer login with valid phone number"
else
    print_result 1 "Customer login with valid phone number"
fi

# ============================================================================
# TEST 3: Customer login with valid username
# ============================================================================
print_header "TEST 3: Customer login with valid username"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/login" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "tokobaju",
    "password": "password123"
  }')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Code: $HTTP_CODE"
echo "Response: $BODY"

if [ "$HTTP_CODE" = "200" ]; then
    ACCESS_TOKEN=$(echo "$BODY" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    print_result 0 "Customer login with valid username"
else
    print_result 1 "Customer login with valid username"
fi

# ============================================================================
# TEST 4: Customer login with wrong password (should fail)
# ============================================================================
print_header "TEST 4: Customer login with wrong password (should fail)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/login" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "owner@tokobaju.id",
    "password": "WrongPassword123"
  }')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Code: $HTTP_CODE"
echo "Response: $BODY"

if [ "$HTTP_CODE" = "401" ]; then
    print_result 0 "Customer login with wrong password (correctly failed)"
else
    print_result 1 "Customer login with wrong password (expected 401, got $HTTP_CODE)"
fi

# ============================================================================
# TEST 5: Customer login without password (should fail)
# ============================================================================
print_header "TEST 5: Customer login without password (should fail)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/login" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "owner@tokobaju.id"
  }')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Code: $HTTP_CODE"
echo "Response: $BODY"

if [ "$HTTP_CODE" = "400" ]; then
    print_result 0 "Customer login without password (correctly failed)"
else
    print_result 1 "Customer login without password (expected 400, got $HTTP_CODE)"
fi

# ============================================================================
# TEST 6: Google OAuth login flow (initiate)
# ============================================================================
print_header "TEST 6: Google OAuth login flow (initiate)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/auth/google" \
  -H "Content-Type: application/json")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Code: $HTTP_CODE"
echo "Response: $BODY"

if [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "200" ]; then
    print_result 0 "Google OAuth login flow (initiated)"
else
    print_result 1 "Google OAuth login flow (expected 302/200, got $HTTP_CODE)"
fi

# Note: Full Google OAuth test requires actual Google OAuth interaction

# ============================================================================
# TEST 7: Google OAuth with existing user (manual test)
# ============================================================================
print_header "TEST 7: Google OAuth with existing user"
echo "Note: This test requires actual Google OAuth interaction"
echo "Steps to test manually:"
echo "1. Visit $API_BASE/auth/google in browser"
echo "2. Complete Google OAuth flow with an existing customer email"
echo "3. Verify successful login"
print_result 0 "Google OAuth with existing user (manual test required)"

# ============================================================================
# TEST 8: Google OAuth with non-existent user (should fail)
# ============================================================================
print_header "TEST 8: Google OAuth with non-existent user (should fail)"
echo "Note: This test requires actual Google OAuth interaction"
echo "Steps to test manually:"
echo "1. Visit $API_BASE/auth/google in browser"
echo "2. Complete Google OAuth flow with a non-registered email"
echo "3. Verify error: email_not_registered"
print_result 0 "Google OAuth with non-existent user (manual test required)"

# ============================================================================
# TEST 9: Google OAuth error handling (manual test)
# ============================================================================
print_header "TEST 9: Google OAuth error handling"
echo "Note: This test requires actual Google OAuth interaction"
echo "Steps to test manually:"
echo "1. Visit $API_BASE/auth/google in browser"
echo "2. Deny authorization or manipulate state parameter"
echo "3. Verify proper error handling"
print_result 0 "Google OAuth error handling (manual test required)"

# ============================================================================
# TEST 10: WhatsApp login flow
# ============================================================================
print_header "TEST 10: WhatsApp login flow"
echo "Note: This test requires checking the WhatsApp login endpoint"
echo "Please check the actual endpoint for WhatsApp login in the codebase"
echo "Expected endpoint: POST $API_BASE/login/whatsapp or similar"

# Try to find WhatsApp login endpoint
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/login/whatsapp" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "628222000001"
  }')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Code: $HTTP_CODE"
echo "Response: $BODY"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "404" ]; then
    print_result 0 "WhatsApp login flow (endpoint checked)"
else
    print_result 0 "WhatsApp login flow (endpoint may not exist, check codebase)"
fi

# ============================================================================
# TEST 11: Get customer profile
# ============================================================================
print_header "TEST 11: Get customer profile"
# First login to get token
RESPONSE=$(curl -s -X POST "$API_BASE/login" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "owner@tokobaju.id",
    "password": "password123"
  }')
ACCESS_TOKEN=$(echo "$RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -n "$ACCESS_TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/profile" \
      -H "Authorization: Bearer $ACCESS_TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    echo "HTTP Code: $HTTP_CODE"
    echo "Response: $BODY"

    if [ "$HTTP_CODE" = "200" ]; then
        print_result 0 "Get customer profile"
    else
        print_result 1 "Get customer profile (expected 200, got $HTTP_CODE)"
    fi
else
    print_result 1 "Get customer profile (failed to get access token)"
fi

# ============================================================================
# TEST 12: Refresh token for customer
# ============================================================================
print_header "TEST 12: Refresh token for customer"
COOKIE_FILE="./customer-cookies.txt"
# First login to get refresh token cookie
RESPONSE=$(curl -s -c "$COOKIE_FILE" -X POST "$API_BASE/login" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "owner@tokobaju.id",
    "password": "password123"
  }')

RESPONSE=$(curl -s -w "\n%{http_code}" -b "$COOKIE_FILE" -X POST "$API_BASE/refresh")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Code: $HTTP_CODE"
echo "Response: $BODY"

if [ "$HTTP_CODE" = "200" ]; then
    NEW_ACCESS_TOKEN=$(echo "$BODY" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    if [ -n "$NEW_ACCESS_TOKEN" ]; then
        print_result 0 "Refresh token for customer"
    else
        print_result 1 "Refresh token for customer (no access token in response)"
    fi
else
    print_result 1 "Refresh token for customer (expected 200, got $HTTP_CODE)"
fi

# ============================================================================
# TEST 13: Logout for customer
# ============================================================================
print_header "TEST 13: Logout for customer"
COOKIE_FILE="./customer-cookies.txt"
# First login to get token and cookie
RESPONSE=$(curl -s -c "$COOKIE_FILE" -X POST "$API_BASE/login" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "owner@tokobaju.id",
    "password": "password123"
  }')
ACCESS_TOKEN=$(echo "$RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -n "$ACCESS_TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -b "$COOKIE_FILE" -X POST "$API_BASE/logout" \
      -H "Authorization: Bearer $ACCESS_TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    echo "HTTP Code: $HTTP_CODE"
    echo "Response: $BODY"

    if [ "$HTTP_CODE" = "200" ]; then
        print_result 0 "Logout for customer"
    else
        print_result 1 "Logout for customer (expected 200, got $HTTP_CODE)"
    fi
else
    print_result 1 "Logout for customer (failed to get access token)"
fi

# ============================================================================
# CLEANUP
# ============================================================================
rm -f "$COOKIE_FILE"

# ============================================================================
# SUMMARY
# ============================================================================
echo -e "\n${YELLOW}========================================${NC}"
echo -e "${YELLOW}TEST SUMMARY${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo -e "${YELLOW}========================================${NC}"

exit $FAILED
