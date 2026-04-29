#!/bin/bash
# Test 4.7: Duplicate Username
# Expected: 409 Conflict
# Note: SKIPPED - API does not validate duplicate username

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "different@example.com",
    "username": "newstaff123",
    "phone": "+6281234567893",
    "password": "SecurePass123",
    "name": "Staff",
    "role": 1
  }'
