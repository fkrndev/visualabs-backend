$testDir = $PSScriptRoot
$files = Get-ChildItem -Path $testDir -Filter "*.sh" | Sort-Object Name

Write-Host "Running all tests..." -ForegroundColor Cyan
Write-Host ""

$passed = 0
$failed = 0

foreach ($file in $files) {
    Write-Host "Running: $($file.Name)" -ForegroundColor Cyan
    $output = bash $file.FullName 2>&1
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0) {
        Write-Host "  PASSED" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  FAILED" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "Total: $($files.Count) | Passed: $passed | Failed: $failed" -ForegroundColor Cyan

if ($failed -eq 0) {
    Write-Host "All tests passed!" -ForegroundColor Green
    exit 0
} else {
    exit 1
}
