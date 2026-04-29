#!/bin/bash
# Test 13.3: Simultaneous Delete Requests
# Delete user yang sama secara simultaneous
# Expected: Hanya 1 yang success, lainnya 404 (sudah dihapus)

for i in {1..5}; do
  curl -X DELETE http://localhost:2024/api/users/2 \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM" &
done
wait
