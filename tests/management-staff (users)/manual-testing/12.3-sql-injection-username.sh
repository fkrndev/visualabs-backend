#!/bin/bash
# Test 12.3: SQL Injection di Username
# Expected: 400 Bad Request (username invalid)

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sql3@example.com",
    "username": "admin'\'' OR '\''1'\''='\''1",
    "phone": "+6281234567880",
    "password": "SecurePass123",
    "name": "SQL Test",
    "role": 1
  }'
