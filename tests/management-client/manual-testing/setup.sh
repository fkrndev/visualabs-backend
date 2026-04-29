#!/bin/bash

# Setup Environment Variables for Management Client Manual Testing
# Source this file before running test scripts: source setup.sh

# Backend URL
export BASE_URL="http://localhost:2024"

# Auth Token - Replace with your actual JWT token
# Get this by running: curl -X POST "$BASE_URL/api/auth/login" -H "Content-Type: application/json" -d '{"identifier":"your_email_or_username","password":"your_password"}'
export AUTH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyMyIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjg5MzkwLCJleHAiOjE4MDg4MjUzOTAsInJvbCI6MX0.mgNMZE1m0lZpxa7KXvgDSqMSnsTpNhcGG9A5sbZ82TU"

# CSRF Token - Replace with your actual CSRF token
# For development, you might be able to use a dummy token or disable CSRF protection
export CSRF_TOKEN="dummy-csrf-token"

# Test Customer IDs - Replace with valid IDs from your database
export CUSTOMER_ID_1=1
export CUSTOMER_ID_2=2
export CUSTOMER_ID_3=3

# Print current settings
echo "=========================================="
echo "Management Client Test Environment Setup"
echo "=========================================="
echo "BASE_URL: $BASE_URL"
echo "AUTH_TOKEN: ${AUTH_TOKEN:0:20}..."
echo "CSRF_TOKEN: ${CSRF_TOKEN:0:20}..."
echo "CUSTOMER_ID_1: $CUSTOMER_ID_1"
echo "CUSTOMER_ID_2: $CUSTOMER_ID_2"
echo "CUSTOMER_ID_3: $CUSTOMER_ID_3"
echo "=========================================="
echo ""
echo "To get auth token, run:"
echo "curl -X POST \"$BASE_URL/api/auth/login\" -H \"Content-Type: application/json\" -d '{\"identifier\":\"your_email\",\"password\":\"your_password\"}'"
echo ""
