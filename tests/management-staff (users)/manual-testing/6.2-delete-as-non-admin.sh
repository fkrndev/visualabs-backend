#!/bin/bash
# Test 6.2: Delete As Non-Admin
# Expected: 403 Forbidden

curl -X DELETE http://localhost:2024/api/users/3 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NyIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5ODI2LCJleHAiOjE4MDg4MTU4MjYsInJvbCI6M30.BtUnRBrjBs_oSpwBN01RepYxkZe7K8x3HkYwmPojRvE"
