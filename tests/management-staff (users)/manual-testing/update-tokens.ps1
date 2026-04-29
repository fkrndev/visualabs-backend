# Script to update tokens in all test files
$adminToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NiIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5NTU4LCJleHAiOjE4MDg4MTU1NTgsInJvbCI6MX0.EatNd8pSLCpAhrODMjYgui9CeyfJsFIuKHBvc7-sIUM"
$staffToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NyIsInR5cCI6ImFkbWluIiwiaWF0IjoxNzc3Mjc5ODI2LCJleHAiOjE4MDg4MTU4MjYsInJvbCI6M30.BtUnRBrjBs_oSpwBN01RepYxkZe7K8x3HkYwmPojRvE"

$testDir = $PSScriptRoot
$files = Get-ChildItem -Path $testDir -Filter "*.sh"

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $content = $content -replace "YOUR_ADMIN_TOKEN", $adminToken
    $content = $content -replace "YOUR_STAFF_TOKEN", $staffToken
    Set-Content -Path $file.FullName -Value $content -NoNewline
    Write-Host "Updated: $($file.Name)"
}

Write-Host "Token update complete!"
