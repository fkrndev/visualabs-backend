#!/bin/bash
# Test 4.3: Invalid Email
# Expected: 400 Bad Request

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "invalid-email",
    "username": "staff123",
    "phone": "+6281234567890",
    "password": "SecurePass123",
    "name": "Staff",
    "role": 1
  }'
