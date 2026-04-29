#!/bin/bash
# Test 11.4: Emoji di Name
# Expected: 201 Created, emoji disimpan dengan benar

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "emoji@example.com",
    "username": "emoji123",
    "phone": "+6281234567883",
    "password": "SecurePass123",
    "name": "Test User 👨‍💻",
    "role": 1
  }'
