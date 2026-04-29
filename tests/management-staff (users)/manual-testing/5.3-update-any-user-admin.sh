#!/bin/bash
# Test 5.3: Update Any User (Admin)
# Expected: 200 OK

curl -X PUT http://localhost:2024/api/users/2 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "updated@example.com",
    "username": "updated123",
    "name": "Admin Updated",
    "role": 2
  }'
