# Error Handling Tests (PowerShell version for Windows)

$BASE_URL = "http://localhost:2024"
$AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxNCIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjk2NDkyLCJleHAiOjE4MDg4MzI0OTIsInJvbCI6Mn0.9KMDPNSt2kqCANcI9ieQFHeMNAEpkXmqkVmiWN3iJQU"

# ========================================
# 10.1 Test invalid ID format
# ========================================
Write-Host "Test 10.1: Test invalid ID format"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/invalid" -Method Get -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"}
    $response | ConvertTo-Json -Depth 10
    Write-Host "FAILED: Should have returned 400"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Write-Host "PASSED: Correctly returned 400 Bad Request"
    } else {
        Write-Host "FAILED: Wrong status code - $($_.Exception.Response.StatusCode.value__)"
    }
}
Write-Host ""

# ========================================
# 10.2 Test invalid JSON
# ========================================
Write-Host "Test 10.2: Test invalid JSON - SKIPPED (requires CSRF token)"
Write-Host "Note: This test requires POST request which is blocked by CSRF protection"
Write-Host ""

# ========================================
# 10.3 Test missing Content-Type
# ========================================
Write-Host "Test 10.3: Test missing Content-Type - SKIPPED (requires CSRF token)"
Write-Host "Note: This test requires POST request which is blocked by CSRF protection"
Write-Host ""
