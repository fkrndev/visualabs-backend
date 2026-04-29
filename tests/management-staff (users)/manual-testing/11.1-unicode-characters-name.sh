#!/bin/bash
# Test 11.1: Unicode Characters di Name
# Expected: 201 Created, unicode disimpan dengan benar

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "unicode@example.com",
    "username": "unicode123",
    "phone": "+6281234567886",
    "password": "SecurePass123",
    "name": "José González 日本語 🎉",
    "role": 1
  }'
