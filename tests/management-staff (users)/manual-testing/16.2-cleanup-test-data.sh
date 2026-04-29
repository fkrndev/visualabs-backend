#!/bin/bash
# Test 16.2: Cleanup Test Data
# Hapus test user yang dibuat di test 16.1
# Expected: 200 OK, test data dibersihkan

curl -X DELETE http://localhost:2024/api/users/97 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM"
