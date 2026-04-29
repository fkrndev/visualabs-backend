#!/bin/bash
# Test 11.2: Special Characters di Email
# Expected: 201 Created atau 400 (tergantung validasi email)

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user+tag@example.com",
    "username": "special123",
    "phone": "+6281234567885",
    "password": "SecurePass123",
    "name": "Special Test",
    "role": 1
  }'
