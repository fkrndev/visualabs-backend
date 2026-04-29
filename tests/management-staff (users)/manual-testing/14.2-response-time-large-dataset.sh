#!/bin/bash
# Test 14.2: Response Time - Large Dataset
# Buat banyak data user dulu, lalu test
# Expected: Response time < 1000ms untuk 100 records

time curl -X GET "http://localhost:2024/api/users?limit=100" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM"
