#!/bin/bash
# Test 12.2: SQL Injection di Name
# Expected: 201 Created, SQL injection tidak dieksekusi

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sql2@example.com",
    "username": "sql2inject123",
    "phone": "+6281234567881",
    "password": "SecurePass123",
    "name": "Robert'\''); DROP TABLE users;--",
    "role": 1
  }'
