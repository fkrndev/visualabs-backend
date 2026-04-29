#!/bin/bash
# Test 13.1: Simultaneous Create Requests
# Kirim 5 create request simultaneously ke email sama
# Expected: Hanya 1 yang success, lainnya 409 (duplicate email)

for i in {1..5}; do
  curl -X POST http://localhost:2024/api/users \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "concurrent@example.com",
      "username": "concurrent'$i'",
      "phone": "+628123456787'$i'",
      "password": "SecurePass123",
      "name": "Concurrent Test",
      "role": 1
    }' &
done
wait
