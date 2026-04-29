#!/bin/bash
# Test 9.1: Transaction Rollback
# Coba create dengan duplicate email untuk trigger rollback
# Expected: 409 Conflict, tidak ada partial data

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newstaff@example.com",
    "username": "rollbacktest",
    "phone": "+6281234567888",
    "password": "SecurePass123",
    "name": "Rollback Test",
    "role": 1
  }'
