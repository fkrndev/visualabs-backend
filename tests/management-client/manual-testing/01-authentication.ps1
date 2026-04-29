# Authentication & Authorization Tests (PowerShell version for Windows)

$BASE_URL = "http://localhost:2024"
$AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyMyIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjg5MzkwLCJleHAiOjE4MDg4MjUzOTAsInJvbCI6MX0.mgNMZE1m0lZpxa7KXvgDSqMSnsTpNhcGG9A5sbZ82TU"
$CSRF_TOKEN = "dummy-csrf-token"

# ========================================
# 1.1 Login untuk mendapatkan token
# ========================================
Write-Host "Test 1.1: Login untuk mendapatkan token (using test-token for development)"
$body = @{
    userId = 23
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/auth/test-token" -Method Post -ContentType "application/json" -Body $body
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host ""
}

# ========================================
# 1.2 Test tanpa auth (harus gagal)
# ========================================
Write-Host "Test 1.2: Test tanpa auth (harus gagal)"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Get
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Expected error: $($_.Exception.Message)"
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)"
}
Write-Host ""
