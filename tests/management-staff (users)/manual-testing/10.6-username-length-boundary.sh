#!/bin/bash
# Test 10.6: Username Length Boundary - Minimum
# Expected: 201 Created (username min 3 karakter)

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "boundary@example.com",
    "username": "abc",
    "phone": "+6281234567888",
    "password": "SecurePass123",
    "name": "Boundary Test",
    "role": 1
  }'
