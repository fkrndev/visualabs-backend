# Create Customer Tests (PowerShell version for Windows)

$BASE_URL = "http://localhost:2024"
$AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxNCIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjk2NDkyLCJleHAiOjE4MDg4MzI0OTIsInJvbCI6Mn0.9KMDPNSt2kqCANcI9ieQFHeMNAEpkXmqkVmiWN3iJQU"

# Get CSRF token from GET request
Write-Host "Getting CSRF token..."
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
try {
    $csrfResponse = Invoke-WebRequest -Uri "$BASE_URL/api/customers" -Method Get -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"} -WebSession $session -UseBasicParsing
    $csrfToken = $csrfResponse.Headers['X-CSRF-Token']
    if (-not $csrfToken) {
        $csrfToken = $csrfResponse.Headers['x-csrf-token']
    }
    if (-not $csrfToken) {
        $csrfToken = $session.Cookies.GetCookies($BASE_URL)['csrf_token'].Value
    }
    Write-Host "CSRF Token retrieved"
} catch {
    Write-Host "Warning: Could not get CSRF token: $($_.Exception.Message)"
    $csrfToken = ""
}

$headers = @{
    "Authorization" = "Bearer $AUTH_TOKEN"
    "Content-Type" = "application/json"
    "X-CSRF-Token" = $csrfToken
}

$headersNoCSRF = @{
    "Authorization" = "Bearer $AUTH_TOKEN"
    "Content-Type" = "application/json"
}

# Generate unique test data using simple random numbers
$random1 = Get-Random -Minimum 100000 -Maximum 999999
$random2 = Get-Random -Minimum 10000 -Maximum 99999
$counter = 0
$usernamePrefix = "testuser"

# ========================================
# 4.1 Create dengan semua field
# ========================================
Write-Host "Test 4.1: Create dengan semua field"
$counter++
$email = "newcustomer${random1}${random2}${counter}@test.local"
$username = "u${random1}${random2}${counter}"
Write-Host "Email: $email"
Write-Host "Username: $username"
$body = @{
    email = $email
    username = $username
    password = "NewPass123"
    name = "New Customer"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers $headers -Body $body
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    if ($_.Exception.Response) {
        $errorResponse = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($errorResponse)
        $responseBody = $reader.ReadToEnd()
        Write-Host "FAILED: $($_.Exception.Message)"
        Write-Host "Response: $responseBody"
    } else {
        Write-Host "FAILED: $($_.Exception.Message)"
    }
}
Write-Host ""
# Wait to avoid rate limiting
Start-Sleep -Seconds 4

# ========================================
# 4.2 Create minimal (hanya email)
# ========================================
Write-Host "Test 4.2: Create minimal (hanya email)"
$counter++
$email = "minimal${random1}${random2}${counter}@test.local"
$body = @{
    email = $email
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers $headers -Body $body
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""
# Wait to avoid rate limiting
Start-Sleep -Seconds 4

# ========================================
# 4.3 Create dengan username saja
# ========================================
Write-Host "Test 4.3: Create dengan username saja"
$counter++
$username = "u${random1}${random2}${counter}"
$body = @{
    username = $username
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers $headers -Body $body
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""
# Wait to avoid rate limiting
Start-Sleep -Seconds 4

# ========================================
# 4.4 Test email duplikat (harus gagal)
# ========================================
Write-Host "Test 4.4: Test email duplikat (harus gagal)"
$body = @{
    email = "owner@tokobaju.id"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers $headers -Body $body
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
# 4.5 Test username duplikat (harus gagal)
# ========================================
Write-Host "Test 4.5: Test username duplikat (harus gagal)"
$body = @{
    username = "tokobaju"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers $headers -Body $body
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
# 4.6 Test phone duplikat (harus gagal)
# ========================================
Write-Host "Test 4.6: Test phone duplikat (harus gagal)"
$body = @{
    phone = "628222000001"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers $headers -Body $body
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
# 4.7 Test email invalid format (harus gagal)
# ========================================
Write-Host "Test 4.7: Test email invalid format (harus gagal)"
$body = @{
    email = "invalid-email"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers $headers -Body $body
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
# 4.8 Test username terlalu pendek (harus gagal)
# ========================================
Write-Host "Test 4.8: Test username terlalu pendek (harus gagal)"
$body = @{
    username = "ab"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers $headers -Body $body
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
# 4.9 Test password weak (harus gagal)
# ========================================
Write-Host "Test 4.9: Test password weak (harus gagal)"
$body = @{
    password = "weak"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers $headers -Body $body
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
# 4.10 Test phone invalid format (harus gagal)
# ========================================
Write-Host "Test 4.10: Test phone invalid format (harus gagal)"
$body = @{
    phone = "abc"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers $headers -Body $body
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
# 4.11 Test tanpa field required (harus gagal)
# ========================================
Write-Host "Test 4.11: Test tanpa field required (harus gagal)"
$body = @{} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers $headers -Body $body
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
# 4.12 Test tanpa CSRF token (harus gagal)
# ========================================
Write-Host "Test 4.12: Test tanpa CSRF token (harus gagal)"
$counter++
$email = "test${random1}${random2}${counter}@test.local"
$body = @{
    email = $email
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers $headersNoCSRF -Body $body
    $response | ConvertTo-Json -Depth 10
    Write-Host "FAILED: Should have returned 403"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 403) {
        Write-Host "PASSED: Correctly returned 403 Forbidden"
    } else {
        Write-Host "Note: CSRF protection may not be enabled - Status: $($_.Exception.Response.StatusCode.value__)"
    }
}
Write-Host ""
