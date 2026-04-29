#!/bin/bash
# Test 5.1: Update Own Profile (Staff)
# Expected: 200 OK

curl -X PUT http://localhost:2024/api/users/2 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NyIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5ODI2LCJleHAiOjE4MDg4MTU4MjYsInJvbCI6M30.BtUnRBrjBs_oSpwBN01RepYxkZe7K8x3HkYwmPojRvE" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "phone": "+6289876543210"
  }'
