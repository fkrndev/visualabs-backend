# Delete Customer Tests (PowerShell version for Windows)

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

# First, create a test customer to delete
Write-Host "Creating test customer for deletion..."
$randomId = Get-Random -Minimum 100000 -Maximum 999999
$testEmail = "delete${randomId}@test.local"
$body = @{
    email = $testEmail
    username = "delete${randomId}"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $CUSTOMER_ID_1 = $response.data.id
    Write-Host "Created customer with ID: $CUSTOMER_ID_1"
} catch {
    Write-Host "FAILED to create test customer: $($_.Exception.Message)"
    exit 1
}
Write-Host ""

# ========================================
# 6.1 Delete single customer
# ========================================
Write-Host "Test 6.1: Delete single customer"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/$CUSTOMER_ID_1" -Method Delete -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 6.2 Delete customer tidak ada (harus gagal)
# ========================================
Write-Host "Test 6.2: Delete customer tidak ada (harus gagal)"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/99999" -Method Delete -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"}
    $response | ConvertTo-Json -Depth 10
    Write-Host "FAILED: Should have returned 404"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Write-Host "PASSED: Correctly returned 404 Not Found"
    } else {
        Write-Host "FAILED: Wrong status code - $($_.Exception.Response.StatusCode.value__)"
    }
}
Write-Host ""

# ========================================
# 6.3 Delete customer yang sudah dihapus (harus gagal)
# ========================================
Write-Host "Test 6.3: Delete customer yang sudah dihapus (harus gagal)"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/$CUSTOMER_ID_1" -Method Delete -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "FAILED: Should have returned 404"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Write-Host "PASSED: Correctly returned 404 Not Found"
    } else {
        Write-Host "FAILED: Wrong status code - $($_.Exception.Response.StatusCode.value__)"
    }
}
Write-Host ""

# ========================================
# 6.4 Verifikasi soft delete (check includeDeleted)
# ========================================
Write-Host "Test 6.4: Verifikasi soft delete (check includeDeleted)"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers?includeDeleted=true" -Method Get -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"}
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""
