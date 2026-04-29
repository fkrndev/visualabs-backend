# View/List Customer Tests (PowerShell version for Windows)

$BASE_URL = "http://localhost:2024"
$AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyMyIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjg5MzkwLCJleHAiOjE4MDg4MjUzOTAsInJvbCI6MX0.mgNMZE1m0lZpxa7KXvgDSqMSnsTpNhcGG9A5sbZ82TU"
$CSRF_TOKEN = "dummy-csrf-token"

$headers = @{
    "Authorization" = "Bearer $AUTH_TOKEN"
}

# ========================================
# 2.1 List semua customer (default)
# ========================================
Write-Host "Test 2.1: List semua customer (default)"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 2.2 List dengan pagination (cursor-based)
# ========================================
Write-Host "Test 2.2: List dengan pagination (cursor-based)"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers?limit=20&cursor=5" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 2.3 Quick search (q parameter)
# ========================================
Write-Host "Test 2.3: Quick search (q parameter)"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers?q=toko" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 2.4 Filter by email
# ========================================
Write-Host "Test 2.4: Filter by email"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers?email=owner@tokobaju.id" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 2.5 Filter by username
# ========================================
Write-Host "Test 2.5: Filter by username"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers?username=tokobaju" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 2.6 Filter by phone
# ========================================
Write-Host "Test 2.6: Filter by phone"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers?phone=628222000001" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 2.7 Date range filter
# ========================================
Write-Host "Test 2.7: Date range filter"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers?dateFrom=2024-01-01&dateTo=2024-12-31" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 2.8 Sort ascending
# ========================================
Write-Host "Test 2.8: Sort ascending"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers?sortBy=createdAt&sortOrder=asc" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 2.9 Sort descending
# ========================================
Write-Host "Test 2.9: Sort descending"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers?sortBy=createdAt&sortOrder=desc" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 2.10 Advanced filter (JSON)
# ========================================
Write-Host "Test 2.10: Advanced filter (JSON)"
try {
    $filters = [System.Web.HttpUtility]::UrlEncode('{"logic":"and","conditions":[{"field":"email","operator":"contains","value":"owner"}]}')
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers?filters=$filters" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 2.11 Multiple sort rules (JSON)
# ========================================
Write-Host "Test 2.11: Multiple sort rules (JSON)"
try {
    $sorts = [System.Web.HttpUtility]::UrlEncode('[{"field":"profile.name","direction":"asc"},{"field":"createdAt","direction":"desc"}]')
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers?sorts=$sorts" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 2.12 Field selection (partial response)
# ========================================
Write-Host "Test 2.12: Field selection (partial response)"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers?fields=id,email,username,profile.name" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 2.13 Include deleted records
# ========================================
Write-Host "Test 2.13: Include deleted records"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers?includeDeleted=true" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""
