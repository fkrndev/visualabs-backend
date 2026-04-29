#!/bin/bash
# Test 7.1: Exceed Rate Limit
# Kirim 101 request
# Expected: Request ke-101 return 429 Too Many Requests

for i in {1..101}; do
  curl -X GET http://localhost:2024/api/users \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" &
done
wait
