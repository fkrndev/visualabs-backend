#!/bin/bash
# Test 4.1: Create Success
# Expected: 201 Created, user + profile created

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newstaff@example.com",
    "username": "newstaff123",
    "phone": "+6281234567890",
    "password": "SecurePass123",
    "name": "New Staff",
    "role": 1
  }'
