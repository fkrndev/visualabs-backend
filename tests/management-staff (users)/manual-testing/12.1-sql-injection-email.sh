#!/bin/bash
# Test 12.1: SQL Injection di Email
# Expected: 400 Bad Request (email invalid) atau 201 tapi data aman

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com'\''; DROP TABLE users--",
    "username": "sqlinject123",
    "phone": "+6281234567882",
    "password": "SecurePass123",
    "name": "SQL Test",
    "role": 1
  }'
