# Bulk Operations Tests (PowerShell version for Windows)

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

# Create test customers for bulk operations
Write-Host "Creating test customers for bulk operations..."
$randomId = Get-Random -Minimum 100000 -Maximum 999999
$ids = @()

for ($i = 1; $i -le 3; $i++) {
    $body = @{
        email = "bulk${randomId}${i}@test.local"
        username = "bulk${randomId}${i}"
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
        $ids += $response.data.id
        Write-Host "Created customer with ID: $($response.data.id)"
    } catch {
        Write-Host "FAILED to create test customer: $($_.Exception.Message)"
    }
}

$CUSTOMER_ID_1 = $ids[0]
$CUSTOMER_ID_2 = $ids[1]
$CUSTOMER_ID_3 = $ids[2]
Write-Host "Test customer IDs: $CUSTOMER_ID_1, $CUSTOMER_ID_2, $CUSTOMER_ID_3"
Write-Host ""

# ========================================
# 7.1 Preview bulk delete
# ========================================
Write-Host "Test 7.1: Preview bulk delete"
$body = @{
    ids = @($CUSTOMER_ID_1, $CUSTOMER_ID_2, $CUSTOMER_ID_3)
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/bulk-delete/preview" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 7.2 Bulk delete
# ========================================
Write-Host "Test 7.2: Bulk delete"
$body = @{
    ids = @($CUSTOMER_ID_1, $CUSTOMER_ID_2, $CUSTOMER_ID_3)
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/bulk-delete" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""

# ========================================
# 7.3 Bulk delete dengan ID tidak ada (harus gagal)
# ========================================
Write-Host "Test 7.3: Bulk delete dengan ID tidak ada (harus gagal)"
$body = @{
    ids = @(99999, 99998)
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/bulk-delete" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "FAILED: Should have returned error"
} catch {
    Write-Host "PASSED: Correctly returned error"
}
Write-Host ""

# ========================================
# 7.4 Bulk delete dengan ID sudah dihapus (harus gagal)
# ========================================
Write-Host "Test 7.4: Bulk delete dengan ID sudah dihapus (harus gagal)"
$body = @{
    ids = @($CUSTOMER_ID_1)
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/bulk-delete" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "FAILED: Should have returned error"
} catch {
    Write-Host "PASSED: Correctly returned error"
}
Write-Host ""

# ========================================
# 7.5 Bulk delete dengan empty array (harus gagal)
# ========================================
Write-Host "Test 7.5: Bulk delete dengan empty array (harus gagal)"
$body = @{
    ids = @()
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/bulk-delete" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "FAILED: Should have returned error"
} catch {
    Write-Host "PASSED: Correctly returned error"
}
Write-Host ""

# Create new test customers for bulk update tests
Write-Host "Creating new test customers for bulk update tests..."
$randomId2 = Get-Random -Minimum 100000 -Maximum 999999
$ids2 = @()

for ($i = 1; $i -le 3; $i++) {
    $body = @{
        email = "bulkupdate${randomId2}${i}@test.local"
        username = "bulkupdate${randomId2}${i}"
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
        $ids2 += $response.data.id
        Write-Host "Created customer with ID: $($response.data.id)"
    } catch {
        Write-Host "FAILED to create test customer: $($_.Exception.Message)"
    }
}

$CUSTOMER_ID_1 = $ids2[0]
$CUSTOMER_ID_2 = $ids2[1]
$CUSTOMER_ID_3 = $ids2[2]
Write-Host ""

# ========================================
# 7.6 Bulk update email
# ========================================
Write-Host "Test 7.6: Bulk update email"
$timestamp = Get-Date -Format 'yyyyMMddHHmmss'
$body = @{
    ids = @($CUSTOMER_ID_1)
    updates = @{
        email = "bulk${timestamp}1@example.com"
    }
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/bulk-update" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""
Start-Sleep -Seconds 10

# ========================================
# 7.7 Bulk update username
# ========================================
Write-Host "Test 7.7: Bulk update username"
$timestamp2 = Get-Date -Format 'yyyyMMddHHmmss'
$body = @{
    ids = @($CUSTOMER_ID_1)
    updates = @{
        username = "bulkuser${timestamp2}"
    }
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/bulk-update" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""
Start-Sleep -Seconds 10

# ========================================
# 7.8 Bulk update multiple fields
# ========================================
Write-Host "Test 7.8: Bulk update multiple fields"
$timestamp3 = Get-Date -Format 'yyyyMMddHHmmss'
$body = @{
    ids = @($CUSTOMER_ID_1)
    updates = @{
        email = "bulk${timestamp3}@example.com"
        username = "bulkuser${timestamp3}"
    }
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/bulk-update" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "PASSED"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
Write-Host ""
Start-Sleep -Seconds 4

# ========================================
# 7.9 Bulk update dengan email duplikat (harus gagal)
# ========================================
Write-Host "Test 7.9: Bulk update dengan email duplikat (harus gagal)"
$body = @{
    ids = @($CUSTOMER_ID_1, $CUSTOMER_ID_2)
    updates = @{
        email = "owner@rumahkuliner.id"
    }
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/bulk-update" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "FAILED: Should have returned error"
} catch {
    Write-Host "PASSED: Correctly returned error"
}
Write-Host ""

# ========================================
# 7.10 Bulk update tanpa perubahan (harus gagal)
# ========================================
Write-Host "Test 7.10: Bulk update tanpa perubahan (harus gagal)"
$body = @{
    ids = @($CUSTOMER_ID_1, $CUSTOMER_ID_2)
    updates = @{}
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/customers/bulk-update" -Method Post -Headers @{"Authorization" = "Bearer $AUTH_TOKEN"; "Content-Type" = "application/json"; "X-CSRF-Token" = $csrfToken} -Body $body -WebSession $session
    $response | ConvertTo-Json -Depth 10
    Write-Host "FAILED: Should have returned error"
} catch {
    Write-Host "PASSED: Correctly returned error"
}
Write-Host ""
