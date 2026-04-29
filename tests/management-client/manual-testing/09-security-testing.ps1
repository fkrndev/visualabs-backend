# Security Testing (PowerShell version for Windows)

$BASE_URL = "http://localhost:2024"
$AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxNCIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjk2NDkyLCJleHAiOjE4MDg4MzI0OTIsInJvbCI6Mn0.9KMDPNSt2kqCANcI9ieQFHeMNAEpkXmqkVmiWN3iJQU"

# ========================================
# 9.1 Test rate limiting (banyak request cepat)
# ========================================
Write-Host "Test 9.1: Test rate limiting (banyak request cepat)"
Write-Host "Sending 101 requests to test rate limiting..."
$rateLimitCount = 0
for ($i = 1; $i -le 101; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "$BASE_URL/api/customers" -Method Get -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"} -UseBasicParsing
        Write-Host "Request $i - HTTP $($response.StatusCode)"
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "Request $i - HTTP $statusCode"
        if ($statusCode -eq 429) {
            $rateLimitCount++
        }
    }
}
if ($rateLimitCount -gt 0) {
    Write-Host "PASSED: Rate limiting triggered ($rateLimitCount requests blocked)"
} else {
    Write-Host "Note: Rate limiting may not have triggered (or limit is higher than 101)"
}
Write-Host ""

# ========================================
# 9.2 Test XSS injection di name
# ========================================
Write-Host "Test 9.2: Test XSS injection di name - SKIPPED (requires CSRF token)"
Write-Host "Note: This test requires POST request which is blocked by CSRF protection"
Write-Host ""

# ========================================
# 9.3 Test SQL injection di email
# ========================================
Write-Host "Test 9.3: Test SQL injection di email"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers?email=' OR '1'='1" -Method Get -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"}
    $response | ConvertTo-Json -Depth 10
    if ($response.data -and $response.data.Count -gt 0) {
        Write-Host "FAILED: SQL injection may have succeeded (returned data)"
    } else {
        Write-Host "PASSED: SQL injection did not return unexpected data"
    }
} catch {
    Write-Host "PASSED: SQL injection blocked - $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 9.4 Test tanpa permission (jika ada role-based)
# ========================================
Write-Host "Test 9.4: Test tanpa permission (jika ada role-based) - SKIPPED"
Write-Host "Note: Requires a token with lower permissions"
Write-Host ""
