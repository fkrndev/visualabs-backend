# Export Data Tests (PowerShell version for Windows)

$BASE_URL = "http://localhost:2024"
$AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxNCIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjk2NDkyLCJleHAiOjE4MDg4MzI0OTIsInJvbCI6Mn0.9KMDPNSt2kqCANcI9ieQFHeMNAEpkXmqkVmiWN3iJQU"

# Get CSRF token from GET request
Write-Host "Getting CSRF token..."
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
try {
    $csrfResponse = Invoke-WebRequest -Uri "$BASE_URL/api/customers" -Method Get -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"} -WebSession $session -UseBasicParsing
    $csrfToken = $csrfResponse.Headers['X-CSRF-Token']
    if (-not $csrfToken) {
        $csrfToken = $session.Cookies.GetCookies($BASE_URL)['csrf_token'].Value
    }
    Write-Host "CSRF Token: $csrfToken"
} catch {
    Write-Host "Warning: Could not get CSRF token: $($_.Exception.Message)"
    $csrfToken = ""
}

# ========================================
# 8.1 Export semua customer
# ========================================
Write-Host "Test 8.1: Export semua customer"
$body = @{} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/export" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 8.2 Export customer spesifik
# ========================================
Write-Host "Test 8.2: Export customer spesifik"
$body = @{
    ids = @(14, 15, 16)
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/export" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""
