#!/bin/bash
# Test 11.3: Special Characters di Username
# Expected: 201 Created atau 400 (tergantung validasi username)

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "special2@example.com",
    "username": "user_name-123",
    "phone": "+6281234567884",
    "password": "SecurePass123",
    "name": "Special Test",
    "role": 1
  }'
