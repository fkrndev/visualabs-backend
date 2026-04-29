# Update Customer Tests (PowerShell version for Windows)

$BASE_URL = "http://localhost:2024"
$AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxNCIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjk2NDkyLCJleHAiOjE4MDg4MzI0OTIsInJvbCI6Mn0.9KMDPNSt2kqCANcI9ieQFHeMNAEpkXmqkVmiWN3iJQU"
$CUSTOMER_ID_1 = 51

# Create session to maintain cookies
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# Get CSRF token by making a GET request
Write-Host "Getting CSRF token..."
try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/api/customers" -Method Get -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"} -WebSession $session -UseBasicParsing
    $csrfToken = $response.Headers['X-CSRF-Token']
    if (-not $csrfToken) {
        $csrfToken = $session.Cookies.GetCookies($BASE_URL)['csrf_token'].Value
    }
    Write-Host "CSRF Token: $csrfToken"
} catch {
    Write-Host "Warning: Could not get CSRF token: $($_.Exception.Message)"
    $csrfToken = ""
}

# ========================================
# 5.1 Update email
# ========================================
Write-Host "Test 5.1: Update email"
$body = @{
    email = "updated$(Get-Date -Format 'yyyyMMddHHmmss')@example.com"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/$CUSTOMER_ID_1" -Method Put -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 5.2 Update username
# ========================================
Write-Host "Test 5.2: Update username"
$body = @{
    username = "updatedusername$(Get-Date -Format 'yyyyMMddHHmmss')"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/$CUSTOMER_ID_1" -Method Put -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 5.3 Update phone
# ========================================
Write-Host "Test 5.3: Update phone"
$body = @{
    phone = "6289876543210"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/$CUSTOMER_ID_1" -Method Put -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 5.4 Update name
# ========================================
Write-Host "Test 5.4: Update name"
$body = @{
    name = "Updated Name"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/$CUSTOMER_ID_1" -Method Put -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 5.5 Update password
# ========================================
Write-Host "Test 5.5: Update password"
$body = @{
    password = "NewPassword123"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/$CUSTOMER_ID_1" -Method Put -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 5.6 Update multiple fields
# ========================================
Write-Host "Test 5.6: Update multiple fields"
$body = @{
    email = "multi$(Get-Date -Format 'yyyyMMddHHmmss')@example.com"
    username = "multiuser$(Get-Date -Format 'yyyyMMddHHmmss')"
    name = "Multi Update"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/$CUSTOMER_ID_1" -Method Put -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 5.7 Update dengan email duplikat (harus gagal)
# ========================================
Write-Host "Test 5.7: Update dengan email duplikat (harus gagal)"
$body = @{
    email = "owner@rumahkuliner.id"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/$CUSTOMER_ID_1" -Method Put -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "FAILED: Should have returned 409"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 409) {
        Write-Host "PASSED: Correctly returned 409 Conflict"
    } else {
        Write-Host "FAILED: Wrong status code - $($_.Exception.Response.StatusCode.value__)"
    }
}
Write-Host ""

# ========================================
# 5.8 Update customer tidak ada (harus gagal)
# ========================================
Write-Host "Test 5.8: Update customer tidak ada (harus gagal)"
$body = @{
    email = "test@example.com"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/99999" -Method Put -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"} -Body $body -WebSession $session
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
# 5.9 Update tanpa perubahan (empty body)
# ========================================
Write-Host "Test 5.9: Update tanpa perubahan (empty body)"
$body = @{} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/$CUSTOMER_ID_1" -Method Put -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""
