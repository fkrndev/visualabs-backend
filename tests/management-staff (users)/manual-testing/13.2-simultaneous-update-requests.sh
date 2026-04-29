#!/bin/bash
# Test 13.2: Simultaneous Update Requests
# Update user yang sama secara simultaneous
# Expected: Semua success atau 1 success (tergantung locking), data consistency maintained

for i in {1..5}; do
  curl -X PUT http://localhost:2024/api/users/2 \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Concurrent Update '$i'"
    }' &
done
wait
