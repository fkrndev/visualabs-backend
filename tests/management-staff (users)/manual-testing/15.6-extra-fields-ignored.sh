#!/bin/bash
# Test 15.6: Extra Fields (Should Be Ignored)
# Expected: 201 Created, extra fields diabaikan

curl -X POST http://localhost:2024/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "extra@example.com",
    "username": "extra123",
    "phone": "+6281234567877",
    "password": "SecurePass123",
    "name": "Extra Field Test",
    "role": 1,
    "isAdmin": true,
    "extraField": "should be ignored"
  }'
