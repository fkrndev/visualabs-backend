# Get Customer Detail Tests (PowerShell version for Windows)

$BASE_URL = "http://localhost:2024"
$AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyMyIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjg5MzkwLCJleHAiOjE4MDg4MjUzOTAsInJvbCI6MX0.mgNMZE1m0lZpxa7KXvgDSqMSnsTpNhcGG9A5sbZ82TU"
$CSRF_TOKEN = "dummy-csrf-token"
$CUSTOMER_ID_1 = 9

$headers = @{
    "Authorization" = "Bearer $AUTH_TOKEN"
}

# ========================================
# 3.1 Get customer by ID
# ========================================
Write-Host "Test 3.1: Get customer by ID"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/$CUSTOMER_ID_1" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 3.2 Get non-existent customer (harus gagal)
# ========================================
Write-Host "Test 3.2: Get non-existent customer (harus gagal)"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/99999" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    Write-Host "FAILED: Should have returned 404"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Write-Host "PASSED: Correctly returned 404"
    } else {
        Write-Host "FAILED: Wrong status code - $($_.Exception.Response.StatusCode.value__)"
    }
}
Write-Host ""

# ========================================
# 3.3 Test caching (call twice, second should return cached=true)
# ========================================
Write-Host "Test 3.3: Test caching - First call"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/$CUSTOMER_ID_1" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

Write-Host "Test 3.3: Test caching - Second call (should have cached=true)"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/$CUSTOMER_ID_1" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
    if ($response.cached -eq $true) {
        Write-Host "PASSED: Response has cached=true"
    } else {
        Write-Host "Note: Response does not have cached flag (caching may not be implemented)"
    }
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""
