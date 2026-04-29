#!/bin/bash
# Test 8.1: XSS Prevention
# Expected: 201 Created, script tags escaped

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "xss@example.com",
    "username": "xss123",
    "phone": "+6281234567899",
    "password": "SecurePass123",
    "name": "<script>alert(\"XSS\")</script>",
    "role": 1
  }'
