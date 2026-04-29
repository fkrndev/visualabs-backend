#!/bin/bash
# Test 1.1: Tanpa Token
# Expected: 401 Unauthorized

curl -X GET http://localhost:2024/api/users
