#!/bin/bash
# Test 15.2: Missing Content-Type
# Expected: 400 Bad Request atau 415 Unsupported Media Type

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -d '{
    "email": "notype@example.com",
    "username": "notype123",
    "phone": "+6281234567879",
    "password": "SecurePass123",
    "name": "No Type Test",
    "role": 1
  }'
