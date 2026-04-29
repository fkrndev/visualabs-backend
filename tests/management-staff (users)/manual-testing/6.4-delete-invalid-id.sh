#!/bin/bash
# Test 6.4: Invalid ID
# Expected: 400 Bad Request

curl -X DELETE http://localhost:2024/api/users/invalid \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM"
