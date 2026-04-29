#!/bin/bash
# Test 4.2: Create As Non-Admin
# Expected: 403 Forbidden

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NyIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5ODI2LCJleHAiOjE4MDg4MTU4MjYsInJvbCI6M30.BtUnRBrjBs_oSpwBN01RepYxkZe7K8x3HkYwmPojRvE" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "staff@example.com",
    "username": "staff123",
    "phone": "+6281234567890",
    "password": "SecurePass123",
    "name": "Staff",
    "role": 1
  }'
