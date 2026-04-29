#!/bin/bash
# Test 16.1: Setup Test Data
# Buat test user untuk testing
# Expected: 201 Created, simpan USER_ID untuk testing selanjutnya

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser1@example.com",
    "username": "testuser1",
    "phone": "+6281111111111",
    "password": "TestPass123",
    "name": "Test User 1",
    "role": 1
  }'
