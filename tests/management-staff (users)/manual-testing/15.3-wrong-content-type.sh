#!/bin/bash
# Test 15.3: Wrong Content-Type
# Expected: 415 Unsupported Media Type atau 400

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/xml" \
  -d '{
    "email": "wrongtype@example.com",
    "username": "wrongtype123",
    "phone": "+6281234567878",
    "password": "SecurePass123",
    "name": "Wrong Type Test",
    "role": 1
  }'
