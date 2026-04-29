#!/bin/bash
# Test 1.2: Token Invalid
# Expected: 401 Unauthorized

curl -X GET http://localhost:2024/api/users \
  -H "Authorization: Bearer invalid_token"
